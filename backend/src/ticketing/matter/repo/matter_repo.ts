import pool from '../../../db/pool.js';
import { Matter, MatterListParams, FieldValue, UserValue, CurrencyValue, StatusValue } from '../../types.js';
import logger from '../../../utils/logger.js';
import { config } from '../../../utils/config.js';
import { PoolClient } from 'pg';
import { SORTABLE_COLUMNS, DEFAULT_SORT, isValidSortColumn } from '../../../constants/sortable-columns.js';


// Field ID cache for optimized sorting (avoids JOIN on ticketing_fields)
interface FieldIdCache {
  subject?: string;
  caseNumber?: string;
  status?: string;
  assignedTo?: string;
  priority?: string;
  contractValue?: string;
  dueDate?: string;
  urgent?: string;
}


// Singleton cache - populated on first use
let fieldIdCache: FieldIdCache | null = null;

  /**
   * Get paginated list of matters with search and sorting
   * 
   * TODO: Implement search functionality
   * - Search across text, number, and other field types
   * - Use PostgreSQL pg_trgm extension for fuzzy matching
   * - Consider performance with proper indexing
   * - Support searching cycle times and SLA statuses
   * 
   * Search Requirements:
   * - Text fields: Use ILIKE with pg_trgm indexes
   * - Number fields: Convert to text for search
   * - Status fields: Search by label
   * - User fields: Search by name
   * - Consider debouncing on frontend (already implemented)
   * 
   * Performance Considerations for 10× Load:
   * - Add GIN indexes on searchable columns
   * - Consider Elasticsearch for advanced search at scale
   * - Implement query result caching
   * - Use connection pooling effectively
   */
  export class MatterRepo {
  /**
   * Initialize field ID cache for optimized sorting
   * Called once and cached for subsequent requests
   */
  private async getFieldIdCache(): Promise<FieldIdCache> {
    if (fieldIdCache) {
      return fieldIdCache;
    }

    const fieldNames = [
      'subject',
      'Case Number',
      'Status',
      'Assigned To',
      'Priority',
      'Contract Value',
      'Due Date',
      'Urgent',
    ];

    const result = await pool.query(
      `SELECT id, name FROM ticketing_fields WHERE name = ANY($1)`,
      [fieldNames],
    );

    fieldIdCache = {};
    for (const row of result.rows) {
      switch (row.name) {
        case 'subject':
          fieldIdCache.subject = row.id;
          break;
        case 'Case Number':
          fieldIdCache.caseNumber = row.id;
          break;
        case 'Status':
          fieldIdCache.status = row.id;
          break;
        case 'Assigned To':
          fieldIdCache.assignedTo = row.id;
          break;
        case 'Priority':
          fieldIdCache.priority = row.id;
          break;
        case 'Contract Value':
          fieldIdCache.contractValue = row.id;
          break;
        case 'Due Date':
          fieldIdCache.dueDate = row.id;
          break;
        case 'Urgent':
          fieldIdCache.urgent = row.id;
          break;
      }
    }

    logger.info('Field ID cache initialized', { fieldIdCache });
    return fieldIdCache;
  }

  async getMatters(params: MatterListParams) {
    const { page = 1, limit = 25, sortBy = DEFAULT_SORT.column, sortOrder = DEFAULT_SORT.order } = params;

    // Validate sortBy parameter - fallback to default if invalid
    const validatedSortBy = sortBy && isValidSortColumn(sortBy) ? sortBy : DEFAULT_SORT.column;

    console.log('Fetching matters with params:', validatedSortBy, sortOrder);
    const offset = (page - 1) * limit;

    const client = await pool.connect();

    try {
      // TODO: Implement search condition
      // Currently search is not implemented - add ILIKE queries with pg_trgm
      const searchCondition = '';
      const queryParams: (string | number)[] = [];
      const paramIndex = 1;

      // Determine sort column
      const sortDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
      let orderByClause = 'tt.created_at DESC';
      let sortJoin = '';
      let sortSelectColumn = '';
      // Get cached field IDs for optimized sorting
      const fieldIds = await this.getFieldIdCache();

      // Build optimized sort configuration based on field type
      // Each field type only joins the tables it needs
      const getSortConfig = (sortKey: string): { join: string; select: string } | null => {
        switch (sortKey) {
          case SORTABLE_COLUMNS.SUBJECT:
            return fieldIds.subject
              ? {
                  join: `LEFT JOIN ticketing_ticket_field_value sort_ttfv
                           ON tt.id = sort_ttfv.ticket_id
                           AND sort_ttfv.ticket_field_id = '${fieldIds.subject}'`,
                  select: ', sort_ttfv.text_value as sort_value',
                }
              : null;

          case SORTABLE_COLUMNS.CASE_NUMBER:
            return fieldIds.caseNumber
              ? {
                  join: `LEFT JOIN ticketing_ticket_field_value sort_ttfv
                           ON tt.id = sort_ttfv.ticket_id
                           AND sort_ttfv.ticket_field_id = '${fieldIds.caseNumber}'`,
                  select: ', sort_ttfv.number_value as sort_value',
                }
              : null;

          case SORTABLE_COLUMNS.STATUS:
            return fieldIds.status
              ? {
                  join: `LEFT JOIN ticketing_ticket_field_value sort_ttfv
                           ON tt.id = sort_ttfv.ticket_id
                           AND sort_ttfv.ticket_field_id = '${fieldIds.status}'
                         LEFT JOIN ticketing_field_status_options sort_tfso
                           ON sort_ttfv.status_reference_value_uuid = sort_tfso.id
                         LEFT JOIN ticketing_field_status_groups sort_tfsg
                           ON sort_tfso.group_id = sort_tfsg.id`,
                  select: ', sort_tfsg.sequence as sort_value',
                }
              : null;

          case SORTABLE_COLUMNS.ASSIGNED_TO:
            return fieldIds.assignedTo
              ? {
                  join: `LEFT JOIN ticketing_ticket_field_value sort_ttfv
                           ON tt.id = sort_ttfv.ticket_id
                           AND sort_ttfv.ticket_field_id = '${fieldIds.assignedTo}'
                         LEFT JOIN users sort_u ON sort_ttfv.user_value = sort_u.id`,
                  select: ', CONCAT(sort_u.first_name, \' \', sort_u.last_name) as sort_value',
                }
              : null;

          case SORTABLE_COLUMNS.PRIORITY:
            return fieldIds.priority
              ? {
                  join: `LEFT JOIN ticketing_ticket_field_value sort_ttfv
                           ON tt.id = sort_ttfv.ticket_id
                           AND sort_ttfv.ticket_field_id = '${fieldIds.priority}'
                         LEFT JOIN ticketing_field_options sort_tfo
                           ON sort_ttfv.select_reference_value_uuid = sort_tfo.id`,
                  select: ', sort_tfo.sequence as sort_value',
                }
              : null;

          case SORTABLE_COLUMNS.CONTRACT_VALUE:
            return fieldIds.contractValue
              ? {
                  join: `LEFT JOIN ticketing_ticket_field_value sort_ttfv
                           ON tt.id = sort_ttfv.ticket_id
                           AND sort_ttfv.ticket_field_id = '${fieldIds.contractValue}'`,
                  select: ', (sort_ttfv.currency_value->>\'amount\')::numeric as sort_value',
                }
              : null;

          case SORTABLE_COLUMNS.DUE_DATE:
            return fieldIds.dueDate
              ? {
                  join: `LEFT JOIN ticketing_ticket_field_value sort_ttfv
                           ON tt.id = sort_ttfv.ticket_id
                           AND sort_ttfv.ticket_field_id = '${fieldIds.dueDate}'`,
                  select: ', sort_ttfv.date_value as sort_value',
                }
              : null;

          case SORTABLE_COLUMNS.URGENT:
            return fieldIds.urgent
              ? {
                  join: `LEFT JOIN ticketing_ticket_field_value sort_ttfv
                           ON tt.id = sort_ttfv.ticket_id
                           AND sort_ttfv.ticket_field_id = '${fieldIds.urgent}'`,
                  select: ', sort_ttfv.boolean_value as sort_value',
                }
              : null;

          default:
            return null;
        }
      };

      if (validatedSortBy === SORTABLE_COLUMNS.CREATED_AT) {
        orderByClause = `tt.created_at ${sortDirection}`;
      } else if (validatedSortBy === SORTABLE_COLUMNS.UPDATED_AT) {
        orderByClause = `tt.updated_at ${sortDirection}`;
      } else if (validatedSortBy === SORTABLE_COLUMNS.RESOLUTION_TIME) {
        // Sort by cycle time - join to history and compute duration
        sortJoin = `
          LEFT JOIN LATERAL (
            SELECT MIN(transitioned_at) as started_at
            FROM ticketing_cycle_time_histories
            WHERE ticket_id = tt.id
          ) cth_start ON true
        `;
        sortSelectColumn = ', cth_start.started_at as sort_value';
        orderByClause = `sort_value ${sortDirection} NULLS LAST`;
      } else if (validatedSortBy === SORTABLE_COLUMNS.SLA) {
        // Sort by SLA status: In Progress (1), Met (2), Breached (3)
        const slaThresholdMs = config.SLA_THRESHOLD_HOURS * 3600000;
        sortJoin = `
          LEFT JOIN LATERAL (
            SELECT
              CASE
                WHEN tfsg.name = 'Done' THEN
                  CASE WHEN EXTRACT(EPOCH FROM (cth.transitioned_at - cth_first.started_at)) * 1000 <= ${slaThresholdMs}
                    THEN 2 ELSE 3 END
                ELSE 1
              END as sla_order
            FROM ticketing_cycle_time_histories cth
            JOIN ticketing_field_status_options tfso ON cth.to_status_id = tfso.id
            JOIN ticketing_field_status_groups tfsg ON tfso.group_id = tfsg.id
            LEFT JOIN LATERAL (
              SELECT MIN(transitioned_at) as started_at
              FROM ticketing_cycle_time_histories
              WHERE ticket_id = tt.id
            ) cth_first ON true
            WHERE cth.ticket_id = tt.id
            ORDER BY cth.transitioned_at DESC
            LIMIT 1
          ) sla_calc ON true
        `;
        sortSelectColumn = ', COALESCE(sla_calc.sla_order, 1) as sort_value';
        orderByClause = `sort_value ${sortDirection}`;
      } else {
        // Use optimized field-specific sorting
        const sortConfig = getSortConfig(validatedSortBy);
        if (sortConfig) {
          sortJoin = sortConfig.join;
          sortSelectColumn = sortConfig.select;
          orderByClause = `sort_value ${sortDirection} NULLS LAST`;
        }
      }

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
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
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

    const fields: Record<string, FieldValue> = {};

    for (const row of fieldsResult.rows) {
      let value: string | number | boolean | Date | CurrencyValue | UserValue | StatusValue | null = null;
      let displayValue: string | undefined = undefined;

      switch (row.field_type) {
        case 'text':
          value = row.text_value || row.string_value;
          break;
        case 'number':
          value = row.number_value ? parseFloat(row.number_value) : null;
          displayValue = value !== null ? value.toLocaleString() : undefined;
          break;
        case 'date':
          value = row.date_value;
          displayValue = row.date_value ? new Date(row.date_value).toLocaleDateString() : undefined;
          break;
        case 'boolean':
          value = row.boolean_value;
          displayValue = value ? '✓' : '✗';
          break;
        case 'currency':
          value = row.currency_value as CurrencyValue;
          if (row.currency_value) {
            displayValue = `${(row.currency_value as CurrencyValue).amount.toLocaleString()} ${(row.currency_value as CurrencyValue).currency}`;
          }
          break;
        case 'user':
          if (row.user_id) {
            const userValue: UserValue = {
              id: row.user_id,
              email: row.user_email,
              firstName: row.user_first_name,
              lastName: row.user_last_name,
              displayName: `${row.user_first_name} ${row.user_last_name}`,
            };
            value = userValue;
            displayValue = userValue.displayName;
          }
          break;
        case 'select':
          value = row.select_reference_value_uuid;
          displayValue = row.select_option_label;
          break;
        case 'status':
          value = row.status_reference_value_uuid;
          displayValue = row.status_option_label;
          // Store group name in metadata for SLA calculations
          if (row.status_group_name) {
            value = {
              statusId: row.status_reference_value_uuid,
              groupName: row.status_group_name,
            } as StatusValue;
          }
          break;
      }

      fields[row.field_name] = {
        fieldId: row.ticket_field_id,
        fieldName: row.field_name,
        fieldType: row.field_type,
        value,
        displayValue,
      };
    }

    return fields;
  }

  /**
   * Update a matter's field value
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

      // Determine which column to update based on field type
      let columnName: string;
      let columnValue: string | number | boolean | Date | null = null;

      switch (fieldType) {
        case 'text':
          columnName = 'text_value';
          columnValue = value as string;
          break;
        case 'number':
          columnName = 'number_value';
          columnValue = value as number;
          break;
        case 'date':
          columnName = 'date_value';
          columnValue = value as Date;
          break;
        case 'boolean':
          columnName = 'boolean_value';
          columnValue = value as boolean;
          break;
        case 'currency':
          columnName = 'currency_value';
          columnValue = JSON.stringify(value);
          break;
        case 'user':
          columnName = 'user_value';
          columnValue = value as number;
          break;
        case 'select':
          columnName = 'select_reference_value_uuid';
          columnValue = value as string;
          break;
        case 'status': {
          columnName = 'status_reference_value_uuid';
          columnValue = value as string;
          
          // Track status change in cycle time history
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
          break;
        }
        default:
          throw new Error(`Unsupported field type: ${fieldType}`);
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

