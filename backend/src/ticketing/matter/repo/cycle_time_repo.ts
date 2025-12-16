import pool from '../../../db/pool.js';

export interface CycleTimeHistoryEntry {
  transitionedAt: Date;
  toGroupName: string;
}

/**
 * CycleTimeRepo - Database queries for cycle time history
 *
 * Handles all database operations related to status transitions
 * and cycle time tracking.
 */
export class CycleTimeRepo {
  /**
   * Get cycle time history for multiple matters in a single query (batch)
   * This avoids N+1 query problem when fetching cycle times for a list of matters
   */
  async getCycleTimeHistoryBatch(
    ticketIds: string[]
  ): Promise<Map<string, CycleTimeHistoryEntry[]>> {
    if (ticketIds.length === 0) {
      return new Map();
    }

    const client = await pool.connect();

    try {
      const result = await client.query(
        `SELECT
          tcth.ticket_id,
          tcth.transitioned_at,
          tfsg.name as to_group_name
        FROM ticketing_cycle_time_histories tcth
        JOIN ticketing_field_status_options tfso ON tcth.to_status_id = tfso.id
        JOIN ticketing_field_status_groups tfsg ON tfso.group_id = tfsg.id
        WHERE tcth.ticket_id = ANY($1)
          AND tfso.deleted_at IS NULL
          AND tfsg.deleted_at IS NULL
        ORDER BY tcth.ticket_id, tcth.transitioned_at ASC`,
        [ticketIds],
      );

      // Group results by ticket_id
      const historyMap = new Map<string, CycleTimeHistoryEntry[]>();

      for (const row of result.rows) {
        if (!historyMap.has(row.ticket_id)) {
          historyMap.set(row.ticket_id, []);
        }
        historyMap.get(row.ticket_id)!.push({
          transitionedAt: new Date(row.transitioned_at),
          toGroupName: row.to_group_name,
        });
      }

      return historyMap;
    } finally {
      client.release();
    }
  }

}

export default CycleTimeRepo;
