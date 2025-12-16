import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { CycleTimeRepo, CycleTimeHistoryEntry } from '../../repo/cycle_time_repo.js';

// Mock config before importing CycleTimeService
vi.mock('../../../utils/config.js', () => ({
  config: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    PORT: 3000,
    NODE_ENV: 'test' as const,
    SLA_THRESHOLD_HOURS: 8,
    LOG_LEVEL: 'error' as const,
  },
}));

// Mock logger
vi.mock('../../../utils/logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { CycleTimeService, CycleTimeResult } from '../cycle_time_service.js';

interface MockCycleTimeRepo {
  getCycleTimeHistoryBatch: Mock;
}

// Helper to access private methods for testing
interface CycleTimeServiceTestable {
  _calculateFromHistory(history: CycleTimeHistoryEntry[]): CycleTimeResult;
  _determineSlaStatus(isInProgress: boolean, resolutionTimeMs: number): 'In Progress' | 'Met' | 'Breached';
}

describe('CycleTimeService', () => {
  let service: CycleTimeService;
  let mockRepo: MockCycleTimeRepo;

  beforeEach(() => {
    mockRepo = {
      getCycleTimeHistoryBatch: vi.fn(),
    };
    service = new CycleTimeService(mockRepo as unknown as CycleTimeRepo);
  });

  describe('getCycleTimeAndSLABatch', () => {
    it('should return empty map when matterIds array is empty', async () => {
      const result = await service.getCycleTimeAndSLABatch([]);

      expect(result.size).toBe(0);
      expect(mockRepo.getCycleTimeHistoryBatch).not.toHaveBeenCalled();
    });

    it('should calculate cycle time and SLA for single matter with complete history', async () => {
      const matterId = 'matter-1';
      const startDate = new Date('2025-01-01T10:00:00Z');
      const endDate = new Date('2025-01-01T14:00:00Z'); // 4 hours later (Met SLA)

      const history: CycleTimeHistoryEntry[] = [
        { transitionedAt: startDate, toGroupName: 'In Progress' },
        { transitionedAt: endDate, toGroupName: 'Done' },
      ];

      mockRepo.getCycleTimeHistoryBatch.mockResolvedValue(
        new Map([[matterId, history]])
      );

      const result = await service.getCycleTimeAndSLABatch([matterId]);

      expect(result.size).toBe(1);
      const cycleTimeResult = result.get(matterId)!;
      expect(cycleTimeResult.cycleTime.resolutionTimeMs).toBe(4 * 60 * 60 * 1000); // 4 hours
      expect(cycleTimeResult.cycleTime.isInProgress).toBe(false);
      expect(cycleTimeResult.cycleTime.startedAt).toEqual(startDate);
      expect(cycleTimeResult.cycleTime.completedAt).toEqual(endDate);
      expect(cycleTimeResult.sla).toBe('Met');
    });

    it('should calculate cycle time for multiple matters in batch', async () => {
      const matter1 = 'matter-1';
      const matter2 = 'matter-2';
      const matter3 = 'matter-3';

      const history1: CycleTimeHistoryEntry[] = [
        { transitionedAt: new Date('2025-01-01T10:00:00Z'), toGroupName: 'In Progress' },
        { transitionedAt: new Date('2025-01-01T14:00:00Z'), toGroupName: 'Done' }, // 4h - Met
      ];

      const history2: CycleTimeHistoryEntry[] = [
        { transitionedAt: new Date('2025-01-01T10:00:00Z'), toGroupName: 'In Progress' },
        { transitionedAt: new Date('2025-01-01T22:00:00Z'), toGroupName: 'Done' }, // 12h - Breached
      ];

      const history3: CycleTimeHistoryEntry[] = [
        { transitionedAt: new Date('2025-01-01T10:00:00Z'), toGroupName: 'In Progress' },
        { transitionedAt: new Date('2025-01-01T12:00:00Z'), toGroupName: 'Review' }, // Still in progress
      ];

      mockRepo.getCycleTimeHistoryBatch.mockResolvedValue(
        new Map([
          [matter1, history1],
          [matter2, history2],
          [matter3, history3],
        ])
      );

      const result = await service.getCycleTimeAndSLABatch([matter1, matter2, matter3]);

      expect(result.size).toBe(3);
      expect(result.get(matter1)!.sla).toBe('Met');
      expect(result.get(matter2)!.sla).toBe('Breached');
      expect(result.get(matter3)!.sla).toBe('In Progress');
    });

    it('should return default result for matter with no history', async () => {
      const matterId = 'matter-1';

      mockRepo.getCycleTimeHistoryBatch.mockResolvedValue(
        new Map([[matterId, []]])
      );

      const result = await service.getCycleTimeAndSLABatch([matterId]);

      expect(result.size).toBe(1);
      const cycleTimeResult = result.get(matterId)!;
      expect(cycleTimeResult.cycleTime.resolutionTimeMs).toBeNull();
      expect(cycleTimeResult.cycleTime.resolutionTimeFormatted).toBe('N/A');
      expect(cycleTimeResult.cycleTime.isInProgress).toBe(true);
      expect(cycleTimeResult.cycleTime.startedAt).toBeNull();
      expect(cycleTimeResult.cycleTime.completedAt).toBeNull();
      expect(cycleTimeResult.sla).toBe('In Progress');
    });

    it('should handle repository errors by throwing', async () => {
      const error = new Error('Database connection failed');
      mockRepo.getCycleTimeHistoryBatch.mockRejectedValue(error);

      await expect(service.getCycleTimeAndSLABatch(['matter-1'])).rejects.toThrow(
        'Database connection failed'
      );
    });
  });

  describe('getCycleTimeAndSLA', () => {
    it('should return cycle time and SLA for single matter', async () => {
      const matterId = 'matter-1';
      const startDate = new Date('2025-01-01T10:00:00Z');
      const endDate = new Date('2025-01-01T16:00:00Z'); // 6 hours later

      const history: CycleTimeHistoryEntry[] = [
        { transitionedAt: startDate, toGroupName: 'In Progress' },
        { transitionedAt: endDate, toGroupName: 'Done' },
      ];

      mockRepo.getCycleTimeHistoryBatch.mockResolvedValue(
        new Map([[matterId, history]])
      );

      const result = await service.getCycleTimeAndSLA(matterId);

      expect(result.cycleTime.resolutionTimeMs).toBe(6 * 60 * 60 * 1000); // 6 hours
      expect(result.sla).toBe('Met');
    });

    it('should return default result when matter not found in batch result', async () => {
      const matterId = 'matter-1';

      mockRepo.getCycleTimeHistoryBatch.mockResolvedValue(new Map());

      const result = await service.getCycleTimeAndSLA(matterId);

      expect(result.cycleTime.resolutionTimeMs).toBeNull();
      expect(result.cycleTime.resolutionTimeFormatted).toBe('N/A');
      expect(result.sla).toBe('In Progress');
    });
  });

  describe('_calculateFromHistory', () => {
    it('should return default result for empty history', () => {
      const result = (service as unknown as CycleTimeServiceTestable)._calculateFromHistory([]);

      expect(result.cycleTime.resolutionTimeMs).toBeNull();
      expect(result.cycleTime.resolutionTimeFormatted).toBe('N/A');
      expect(result.cycleTime.isInProgress).toBe(true);
      expect(result.cycleTime.startedAt).toBeNull();
      expect(result.cycleTime.completedAt).toBeNull();
      expect(result.sla).toBe('In Progress');
    });

    it('should calculate in-progress cycle time using current time', () => {
      const startDate = new Date('2025-01-01T10:00:00Z');
      const now = new Date('2025-01-01T12:00:00Z');
      vi.setSystemTime(now);

      const history: CycleTimeHistoryEntry[] = [
        { transitionedAt: startDate, toGroupName: 'In Progress' },
      ];

      const result = (service as unknown as CycleTimeServiceTestable)._calculateFromHistory(history);

      expect(result.cycleTime.isInProgress).toBe(true);
      expect(result.cycleTime.startedAt).toEqual(startDate);
      expect(result.cycleTime.completedAt).toBeNull();
      expect(result.cycleTime.resolutionTimeMs).toBe(2 * 60 * 60 * 1000); // 2 hours
      expect(result.sla).toBe('In Progress');

      vi.useRealTimers();
    });

    it('should calculate completed cycle time with Done status', () => {
      const startDate = new Date('2025-01-01T10:00:00Z');
      const endDate = new Date('2025-01-01T15:00:00Z');

      const history: CycleTimeHistoryEntry[] = [
        { transitionedAt: startDate, toGroupName: 'In Progress' },
        { transitionedAt: new Date('2025-01-01T12:00:00Z'), toGroupName: 'Review' },
        { transitionedAt: endDate, toGroupName: 'Done' },
      ];

      const result = (service as unknown as CycleTimeServiceTestable)._calculateFromHistory(history);

      expect(result.cycleTime.isInProgress).toBe(false);
      expect(result.cycleTime.startedAt).toEqual(startDate);
      expect(result.cycleTime.completedAt).toEqual(endDate);
      expect(result.cycleTime.resolutionTimeMs).toBe(5 * 60 * 60 * 1000); // 5 hours
      expect(result.sla).toBe('Met');
    });

    it('should handle single transition to Done', () => {
      const doneDate = new Date('2025-01-01T10:00:00Z');

      const history: CycleTimeHistoryEntry[] = [
        { transitionedAt: doneDate, toGroupName: 'Done' },
      ];

      const result = (service as unknown as CycleTimeServiceTestable)._calculateFromHistory(history);

      expect(result.cycleTime.isInProgress).toBe(false);
      expect(result.cycleTime.startedAt).toEqual(doneDate);
      expect(result.cycleTime.completedAt).toEqual(doneDate);
      expect(result.cycleTime.resolutionTimeMs).toBe(0);
      expect(result.sla).toBe('Met');
    });

    it('should format resolution time correctly', () => {
      const startDate = new Date('2025-01-01T10:00:00Z');
      const endDate = new Date('2025-01-01T11:30:00Z'); // 1.5 hours

      const history: CycleTimeHistoryEntry[] = [
        { transitionedAt: startDate, toGroupName: 'In Progress' },
        { transitionedAt: endDate, toGroupName: 'Done' },
      ];

      const result = (service as unknown as CycleTimeServiceTestable)._calculateFromHistory(history);

      expect(result.cycleTime.resolutionTimeFormatted).toMatch(/1h 30m/);
    });
  });

  describe('_determineSlaStatus', () => {
    it('should return "In Progress" when matter is not completed', () => {
      const result = (service as unknown as CycleTimeServiceTestable)._determineSlaStatus(true, 5 * 60 * 60 * 1000);
      expect(result).toBe('In Progress');
    });

    it('should return "Met" when resolution time is exactly at threshold', () => {
      const eightHoursMs = 8 * 60 * 60 * 1000;
      const result = (service as unknown as CycleTimeServiceTestable)._determineSlaStatus(false, eightHoursMs);
      expect(result).toBe('Met');
    });

    it('should return "Met" when resolution time is below threshold', () => {
      const fourHoursMs = 4 * 60 * 60 * 1000;
      const result = (service as unknown as CycleTimeServiceTestable)._determineSlaStatus(false, fourHoursMs);
      expect(result).toBe('Met');
    });

    it('should return "Breached" when resolution time exceeds threshold', () => {
      const tenHoursMs = 10 * 60 * 60 * 1000;
      const result = (service as unknown as CycleTimeServiceTestable)._determineSlaStatus(false, tenHoursMs);
      expect(result).toBe('Breached');
    });

    it('should return "Met" for zero resolution time', () => {
      const result = (service as unknown as CycleTimeServiceTestable)._determineSlaStatus(false, 0);
      expect(result).toBe('Met');
    });

    it('should return "Breached" when just over threshold', () => {
      const slightlyOverMs = 8 * 60 * 60 * 1000 + 1;
      const result = (service as unknown as CycleTimeServiceTestable)._determineSlaStatus(false, slightlyOverMs);
      expect(result).toBe('Breached');
    });

    it('should always return "In Progress" regardless of time when in progress', () => {
      const longTimeMs = 100 * 60 * 60 * 1000; // 100 hours
      const result = (service as unknown as CycleTimeServiceTestable)._determineSlaStatus(true, longTimeMs);
      expect(result).toBe('In Progress');
    });
  });

  describe('Edge Cases', () => {
    it('should handle matter with multiple transitions before completion', async () => {
      const matterId = 'matter-complex';
      const history: CycleTimeHistoryEntry[] = [
        { transitionedAt: new Date('2025-01-01T10:00:00Z'), toGroupName: 'Backlog' },
        { transitionedAt: new Date('2025-01-01T11:00:00Z'), toGroupName: 'In Progress' },
        { transitionedAt: new Date('2025-01-01T12:00:00Z'), toGroupName: 'Review' },
        { transitionedAt: new Date('2025-01-01T13:00:00Z'), toGroupName: 'In Progress' },
        { transitionedAt: new Date('2025-01-01T14:00:00Z'), toGroupName: 'Done' },
      ];

      mockRepo.getCycleTimeHistoryBatch.mockResolvedValue(
        new Map([[matterId, history]])
      );

      const result = await service.getCycleTimeAndSLABatch([matterId]);
      const cycleTimeResult = result.get(matterId)!;

      expect(cycleTimeResult.cycleTime.startedAt).toEqual(new Date('2025-01-01T10:00:00Z'));
      expect(cycleTimeResult.cycleTime.completedAt).toEqual(new Date('2025-01-01T14:00:00Z'));
      expect(cycleTimeResult.cycleTime.resolutionTimeMs).toBe(4 * 60 * 60 * 1000);
      expect(cycleTimeResult.sla).toBe('Met');
    });

    it('should handle batch with mix of completed, in-progress, and no-history matters', async () => {
      const completed = 'matter-completed';
      const inProgress = 'matter-inprogress';
      const noHistory = 'matter-nohistory';

      mockRepo.getCycleTimeHistoryBatch.mockResolvedValue(
        new Map([
          [
            completed,
            [
              { transitionedAt: new Date('2025-01-01T10:00:00Z'), toGroupName: 'In Progress' },
              { transitionedAt: new Date('2025-01-01T12:00:00Z'), toGroupName: 'Done' },
            ],
          ],
          [
            inProgress,
            [{ transitionedAt: new Date('2025-01-01T10:00:00Z'), toGroupName: 'In Progress' }],
          ],
          [noHistory, []],
        ])
      );

      const result = await service.getCycleTimeAndSLABatch([completed, inProgress, noHistory]);

      expect(result.get(completed)!.cycleTime.isInProgress).toBe(false);
      expect(result.get(completed)!.sla).toBe('Met');

      expect(result.get(inProgress)!.cycleTime.isInProgress).toBe(true);
      expect(result.get(inProgress)!.sla).toBe('In Progress');

      expect(result.get(noHistory)!.cycleTime.resolutionTimeMs).toBeNull();
      expect(result.get(noHistory)!.sla).toBe('In Progress');
    });

    it('should correctly identify SLA breach at exactly 8 hours and 1 millisecond', async () => {
      const matterId = 'matter-breach-edge';
      const startDate = new Date('2025-01-01T10:00:00.000Z');
      const endDate = new Date('2025-01-01T18:00:00.001Z'); // 8h + 1ms

      const history: CycleTimeHistoryEntry[] = [
        { transitionedAt: startDate, toGroupName: 'In Progress' },
        { transitionedAt: endDate, toGroupName: 'Done' },
      ];

      mockRepo.getCycleTimeHistoryBatch.mockResolvedValue(
        new Map([[matterId, history]])
      );

      const result = await service.getCycleTimeAndSLABatch([matterId]);
      expect(result.get(matterId)!.sla).toBe('Breached');
    });

    it('should correctly identify SLA met at exactly 8 hours', async () => {
      const matterId = 'matter-met-edge';
      const startDate = new Date('2025-01-01T10:00:00.000Z');
      const endDate = new Date('2025-01-01T18:00:00.000Z'); // exactly 8h

      const history: CycleTimeHistoryEntry[] = [
        { transitionedAt: startDate, toGroupName: 'In Progress' },
        { transitionedAt: endDate, toGroupName: 'Done' },
      ];

      mockRepo.getCycleTimeHistoryBatch.mockResolvedValue(
        new Map([[matterId, history]])
      );

      const result = await service.getCycleTimeAndSLABatch([matterId]);
      expect(result.get(matterId)!.sla).toBe('Met');
    });
  });

  describe('Integration with formatDuration', () => {
    it('should format various durations correctly', async () => {
      const matterId = 'matter-1';

      // Test different durations
      const testCases = [
        { hours: 0.5, expectedPattern: /30m/ },
        { hours: 1, expectedPattern: /1h/ },
        { hours: 2.25, expectedPattern: /2h 15m/ },
        { hours: 24, expectedPattern: /1d/ },
      ];

      for (const { hours, expectedPattern } of testCases) {
        const startDate = new Date('2025-01-01T10:00:00Z');
        const endDate = new Date(startDate.getTime() + hours * 60 * 60 * 1000);

        const history: CycleTimeHistoryEntry[] = [
          { transitionedAt: startDate, toGroupName: 'In Progress' },
          { transitionedAt: endDate, toGroupName: 'Done' },
        ];

        mockRepo.getCycleTimeHistoryBatch.mockResolvedValue(
          new Map([[matterId, history]])
        );

        const result = await service.getCycleTimeAndSLABatch([matterId]);
        expect(result.get(matterId)!.cycleTime.resolutionTimeFormatted).toMatch(expectedPattern);
      }
    });
  });
});
