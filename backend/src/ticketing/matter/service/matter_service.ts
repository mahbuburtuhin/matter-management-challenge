import { MatterRepo } from '../repo/matter_repo.js';
import { CycleTimeService } from './cycle_time_service.js';
import { Matter, MatterListParams, MatterListResponse, StatusValue, CurrencyValue, UserValue } from '../../types.js';
import logger from '../../../utils/logger.js';

export class MatterService {
  private matterRepo: MatterRepo;
  private cycleTimeService: CycleTimeService;

  constructor() {
    this.matterRepo = new MatterRepo();
    this.cycleTimeService = new CycleTimeService();
  }

  async getMatters(params: MatterListParams): Promise<MatterListResponse> {
    const { page = 1, limit = 25 } = params;
    try {
      const { matters, total } = await this.matterRepo.getMatters(params);



      const matterIds = matters.map(matter => matter.id);

      const cycleTimeMap = await this.cycleTimeService.getCycleTimeAndSLABatch(
        matterIds
      );

      const enrichedMatters = matters.map(matter => ({
        ...matter,
        ...cycleTimeMap.get(matter.id),
      }));

      const totalPages = Math.ceil(total / limit);

      return {
        data: enrichedMatters,
        total,
        page,
        limit,
        totalPages,
      };
    } catch (error) {
      logger.error('Failed to fetch matters', { error, params });
      throw error;
    }
  }

  async getMatterById(matterId: string): Promise<Matter | null> {
    const matter = await this.matterRepo.getMatterById(matterId);

    if (!matter) {
      return null;
    }

    const { cycleTime, sla } = await this.cycleTimeService.getCycleTimeAndSLA(
      matter.id,
    );

    return {
      ...matter,
      cycleTime,
      sla,
    };
  }

  async updateMatter(
    matterId: string,
    fieldId: string,
    fieldType: string,
    value: string | number | boolean | Date | CurrencyValue | UserValue | StatusValue | null,
    userId: number,
  ): Promise<void> {
    await this.matterRepo.updateMatterField(matterId, fieldId, fieldType, value, userId);
  }
}

export default MatterService;

