import { CycleTimeRepo, CycleTimeHistoryEntry } from '../repo/cycle_time_repo.js';
import { config } from '../../../utils/config.js';
import { formatDuration } from '../../../utils/format.js';
import { SLAStatus, CycleTime } from '../../types.js';
import logger from '../../../utils/logger.js';

export interface CycleTimeResult {
  cycleTime: CycleTime;
  sla: SLAStatus;
}

const DEFAULT_CYCLE_TIME_RESULT: CycleTimeResult = {
  cycleTime: {
    resolutionTimeMs: null,
    resolutionTimeFormatted: 'N/A',
    isInProgress: true,
    startedAt: null,
    completedAt: null,
  },
  sla: 'In Progress',
};

/**
 * CycleTimeService - Calculate resolution times and SLA status for matters
 *
 * SLA Status Logic:
 * - "In Progress": Matter not yet in "Done" status
 * - "Met": Resolved within threshold (≤ 8 hours)
 * - "Breached": Resolved after threshold (> 8 hours)
 */
export class CycleTimeService {
  private readonly _slaThresholdMs: number;
  private readonly _cycleTimeRepo: CycleTimeRepo;

  constructor(cycleTimeRepo?: CycleTimeRepo) {
    this._slaThresholdMs = config.SLA_THRESHOLD_HOURS * 60 * 60 * 1000;
    this._cycleTimeRepo = cycleTimeRepo ?? new CycleTimeRepo();
  }

  /**
   * Get cycle time and SLA for multiple matters in batch
   * This is the preferred method for list views to avoid N+1 queries
   */
  async getCycleTimeAndSLABatch(matterIds: string[]): Promise<Map<string, CycleTimeResult>> {
    if (matterIds.length === 0) {
      logger.debug('getCycleTimeAndSLABatch called with empty matterIds');
      return new Map();
    }

    logger.debug('Fetching cycle time for batch', { ticketCount: matterIds.length });

    try {
      const historyMap = await this._cycleTimeRepo.getCycleTimeHistoryBatch(matterIds);
      const resultMap = new Map<string, CycleTimeResult>();

      let breachedCount = 0;
      let metCount = 0;
      let inProgressCount = 0;

      for (const ticketId of matterIds) {
        const history = historyMap.get(ticketId) || [];
        const result = this._calculateFromHistory(history);
        resultMap.set(ticketId, result);

        if (result.sla === 'Breached') breachedCount++;
        else if (result.sla === 'Met') metCount++;
        else inProgressCount++;
      }

      logger.info('Calculated cycle times for batch', {
        ticketCount: matterIds.length,
        breached: breachedCount,
        met: metCount,
        inProgress: inProgressCount,
      });

      return resultMap;
    } catch (error) {
      logger.error('Failed to fetch cycle time batch', { error, ticketCount: matterIds.length });
      throw error;
    }
  }

  /**
   * Get cycle time and SLA for a single matter
   */
  async getCycleTimeAndSLA(matterIds: string): Promise<CycleTimeResult> {
    logger.debug('Fetching cycle time for single ticket');
    const resultMap = await this.getCycleTimeAndSLABatch([matterIds]);
    const result = resultMap.get(matterIds) ?? DEFAULT_CYCLE_TIME_RESULT;

    if (!resultMap.has(matterIds)) {
      logger.warn('No cycle time history found for ticket, using default');
    }

    return result;
  }

  /**
   * Core calculation logic - pure function that works with history data
   */
  private _calculateFromHistory(history: CycleTimeHistoryEntry[]): CycleTimeResult {
    if (history.length === 0) {
      return DEFAULT_CYCLE_TIME_RESULT;
    }

    const startedAt = history[0].transitionedAt;
    const lastTransition = history[history.length - 1];
    const isInProgress = lastTransition.toGroupName !== 'Done';

    const completedAt = isInProgress ? null : lastTransition.transitionedAt;
    const endTime = isInProgress ? new Date() : completedAt;
    const resolutionTimeMs = endTime!.getTime() - startedAt.getTime();

    const sla = this._determineSlaStatus(isInProgress, resolutionTimeMs);

    return {
      cycleTime: {
        resolutionTimeMs,
        resolutionTimeFormatted: formatDuration(resolutionTimeMs),
        isInProgress,
        startedAt,
        completedAt,
      },
      sla,
    };
  }

  /**
   * Determine SLA status based on completion state and resolution time
   */
  private _determineSlaStatus(isInProgress: boolean, resolutionTimeMs: number): SLAStatus {
    if (isInProgress) {
      return 'In Progress';
    }
    return resolutionTimeMs <= this._slaThresholdMs ? 'Met' : 'Breached';
  }

}

export default CycleTimeService;
