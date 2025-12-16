import pool from '../../../db/pool.js';
import { Matter, MatterListParams, FieldValue, CurrencyValue, UserValue, StatusValue } from '../../types.js';
import { PoolClient } from 'pg';
import { DEFAULT_SORT, isValidSortColumn } from '../../../constants/sortable-columns.js';
import { getFieldIdCache } from './utils/field_id_cache.js';
import { buildSearchCondition } from './utils/query_builders/query_builder_search.js';
import { buildSortQuery } from './utils/query_builders/query_builder_sort.js';
import { mapFieldValueRows, FieldValueRow } from './utils/mappers/field_value_mapper.js';
import { getUpdateColumnMapping } from './utils/mappers/field_update_mapper.js';
import logger from '../../../utils/logger.js';

/**
 * Get paginated list of matters with search and sorting
 *
 * Search functionality implemented with:
 * - Search across text, number, and other field types
 * - PostgreSQL pg_trgm extension for fuzzy matching
 * - Support for searching cycle times and SLA statuses
 *
 * Performance Considerations for 10× Load:
 * - Add GIN indexes on searchable columns
 * - Consider Elasticsearch for advanced search at scale
 * - Implement query result caching
 * - Use connection pooling effectively
 */
export class MatterRepo {

  async getMatters(params: MatterListParams) {
    const { page = 1, limit = 25, sortBy = DEFAULT_SORT.column, sortOrder = DEFAULT_SORT.order } = params;

    // Validate sortBy parameter - fallback to default if invalid
    const validatedSortBy = sortBy && isValidSortColumn(sortBy) ? sortBy : DEFAULT_SORT.column;

    console.log('Fetching matters with params:', validatedSortBy, sortOrder);
    const offset = (page - 1) * limit;

    const client = await pool.connect();

    try {
      // Build search condition using extracted module
      const { condition: searchCondition, params: searchParams, paramStartIndex } = buildSearchCondition(
        params.search,
        1,
      );

      const queryParams: (string | number)[] = [...searchParams];

      // Get cached field IDs and build sort query using extracted modules
      const fieldIds = await getFieldIdCache();
      const { orderByClause, sortJoin, sortSelectColumn } = buildSortQuery(
        validatedSortBy,
        sortOrder,
        fieldIds,
      );

      // Get total count
      const countQuery = `
        SELECT COUNT(DISTINCT tt.id) as total
        FROM ticketing_ticket tt
        LEFT JOIN ticketing_ticket_field_value ttfv ON tt.id = ttfv.ticket_id
        WHERE 1=1 ${searchCondition}
      `;

      const countResult = await client.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].total);

      // Get matters
      const mattersQuery = `
        SELECT DISTINCT tt.id, tt.board_id, tt.created_at, tt.updated_at ${sortSelectColumn}
        FROM ticketing_ticket tt
        LEFT JOIN ticketing_ticket_field_value ttfv ON tt.id = ttfv.ticket_id
        ${sortJoin}
        WHERE 1=1 ${searchCondition}
        ORDER BY ${orderByClause}
        LIMIT $${paramStartIndex} OFFSET $${paramStartIndex + 1}
      `;

      queryParams.push(limit, offset);
      const mattersResult = await client.query(mattersQuery, queryParams);

      // Get all fields for these matters
      const matters: Matter[] = [];

      for (const matterRow of mattersResult.rows) {
        const fields = await this.getMatterFields(client, matterRow.id);

        matters.push({
          id: matterRow.id,
          boardId: matterRow.board_id,
          fields,
          createdAt: matterRow.created_at,
          updatedAt: matterRow.updated_at,
        });
      }

      return { matters, total };
    } finally {
      client.release();
    }
  }

  /**
   * Get a single matter by ID
   */
  async getMatterById(matterId: string): Promise<Matter | null> {
    const client = await pool.connect();

    try {
      const matterResult = await client.query(
        `SELECT id, board_id, created_at, updated_at
         FROM ticketing_ticket
         WHERE id = $1`,
        [matterId],
      );

      if (matterResult.rows.length === 0) {
        return null;
      }

      const matterRow = matterResult.rows[0];
      const fields = await this.getMatterFields(client, matterId);

      return {
        id: matterRow.id,
        boardId: matterRow.board_id,
        fields,
        createdAt: matterRow.created_at,
        updatedAt: matterRow.updated_at,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get all field values for a matter
   * Uses the field_value_mapper module for transformation
   */
  private async getMatterFields(client: PoolClient, ticketId: string): Promise<Record<string, FieldValue>> {
    const fieldsResult = await client.query(
      `SELECT
        ttfv.id,
        ttfv.ticket_field_id,
        tf.name as field_name,
        tf.field_type,
        ttfv.text_value,
        ttfv.string_value,
        ttfv.number_value,
        ttfv.date_value,
        ttfv.boolean_value,
        ttfv.currency_value,
        ttfv.user_value,
        ttfv.select_reference_value_uuid,
        ttfv.status_reference_value_uuid,
        -- User data
        u.id as user_id,
        u.email as user_email,
        u.first_name as user_first_name,
        u.last_name as user_last_name,
        -- Select option label
        tfo.label as select_option_label,
        -- Status option data
        tfso.label as status_option_label,
        tfsg.name as status_group_name
       FROM ticketing_ticket_field_value ttfv
       JOIN ticketing_fields tf ON ttfv.ticket_field_id = tf.id
       LEFT JOIN users u ON ttfv.user_value = u.id
       LEFT JOIN ticketing_field_options tfo ON ttfv.select_reference_value_uuid = tfo.id
       LEFT JOIN ticketing_field_status_options tfso ON ttfv.status_reference_value_uuid = tfso.id
       LEFT JOIN ticketing_field_status_groups tfsg ON tfso.group_id = tfsg.id
       WHERE ttfv.ticket_id = $1`,
      [ticketId],
    );

    // Use extracted mapper module for transformation
    return mapFieldValueRows(fieldsResult.rows as FieldValueRow[]);
  }

  /**
   * Update a matter's field value
   * Uses the field_update_mapper module for column mapping
   */
  async updateMatterField(
    matterId: string,
    fieldId: string,
    fieldType: string,
    value: string | number | boolean | Date | CurrencyValue | UserValue | StatusValue | null,
    userId: number,
  ): Promise<void> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Use extracted mapper module to determine column and value
      const { columnName, columnValue } = getUpdateColumnMapping(fieldType, value);

      // Special handling for status changes - track in cycle time history
      if (fieldType === 'status') {
        const currentStatusResult = await client.query(
          `SELECT status_reference_value_uuid
           FROM ticketing_ticket_field_value
           WHERE ticket_id = $1 AND ticket_field_id = $2`,
          [matterId, fieldId],
        );

        if (currentStatusResult.rows.length > 0) {
          const fromStatusId = currentStatusResult.rows[0].status_reference_value_uuid;

          await client.query(
            `INSERT INTO ticketing_cycle_time_histories
             (ticket_id, status_field_id, from_status_id, to_status_id, transitioned_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [matterId, fieldId, fromStatusId, value],
          );
        }
      }

      // Upsert field value
      await client.query(
        `INSERT INTO ticketing_ticket_field_value 
         (ticket_id, ticket_field_id, ${columnName}, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (ticket_id, ticket_field_id)
         DO UPDATE SET ${columnName} = $3, updated_by = $5, updated_at = NOW()`,
        [matterId, fieldId, columnValue, userId, userId],
      );

      // Update matter's updated_at
      await client.query(
        `UPDATE ticketing_ticket SET updated_at = NOW() WHERE id = $1`,
        [matterId],
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error updating matter field', { error, matterId, fieldId });
      throw error;
    } finally {
      client.release();
    }
  }
}

export default MatterRepo;

