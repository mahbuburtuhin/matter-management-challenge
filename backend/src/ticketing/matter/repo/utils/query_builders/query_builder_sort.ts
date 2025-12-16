import { SORTABLE_COLUMNS } from '../../../../../constants/sortable-columns.js';
import { config } from '../../../../../utils/config.js';
import { FieldIdCache } from '../field_id_cache.js';

/**
 * Result of building a sort query
 */
export interface SortQueryResult {
  orderByClause: string;
  sortJoin: string;
  sortSelectColumn: string;
}

/**
 * Builds sort query components (ORDER BY, JOINs, SELECT) for a given sort column
 *
 * This function handles 12 different sortable columns, each with potentially
 * different JOIN requirements and sort logic:
 *
 * Simple columns (no JOINs needed):
 * - created_at: Sort by ticket creation time
 * - updated_at: Sort by ticket last update time
 *
 * Field-based columns (require JOINs to field value table):
 * - subject: Text field
 * - case_number: Number field
 * - status: Status field (sorts by status group sequence)
 * - assigned_to: User field (sorts by user's full name)
 * - priority: Select field (sorts by option sequence)
 * - contract_value: Currency field (sorts by amount)
 * - due_date: Date field
 * - urgent: Boolean field
 *
 * Computed columns (require complex subqueries):
 * - resolution_time: Computed from cycle time history
 * - sla: Computed SLA status (In Progress=1, Met=2, Breached=3)
 *
 * @param sortBy - The column to sort by (from SORTABLE_COLUMNS)
 * @param sortOrder - Sort direction ('asc' or 'desc')
 * @param fieldIds - Field ID cache for optimized field-based sorting
 * @returns Object containing ORDER BY clause, JOIN clause, and SELECT column
 *
 * @example
 * const result = await buildSortQuery('subject', 'asc', fieldIds);
 * // result.orderByClause: "sort_value ASC NULLS LAST"
 * // result.sortJoin: "LEFT JOIN ticketing_ticket_field_value sort_ttfv ..."
 * // result.sortSelectColumn: ", sort_ttfv.text_value as sort_value"
 */
export function buildSortQuery(
  sortBy: string,
  sortOrder: string,
  fieldIds: FieldIdCache,
): SortQueryResult {
  const sortDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  // Simple timestamp columns - no JOINs needed
  if (sortBy === SORTABLE_COLUMNS.CREATED_AT) {
    return {
      orderByClause: `tt.created_at ${sortDirection}`,
      sortJoin: '',
      sortSelectColumn: '',
    };
  }

  if (sortBy === SORTABLE_COLUMNS.UPDATED_AT) {
    return {
      orderByClause: `tt.updated_at ${sortDirection}`,
      sortJoin: '',
      sortSelectColumn: '',
    };
  }

  // Resolution time - computed from cycle time history
  if (sortBy === SORTABLE_COLUMNS.RESOLUTION_TIME) {
    return {
      orderByClause: `sort_value ${sortDirection} NULLS LAST`,
      sortJoin: `
        LEFT JOIN LATERAL (
          SELECT MIN(transitioned_at) as started_at
          FROM ticketing_cycle_time_histories
          WHERE ticket_id = tt.id
        ) cth_start ON true
      `,
      sortSelectColumn: ', cth_start.started_at as sort_value',
    };
  }

  // SLA status - computed (In Progress=1, Met=2, Breached=3)
  if (sortBy === SORTABLE_COLUMNS.SLA) {
    const slaThresholdMs = config.SLA_THRESHOLD_HOURS * 3600000;
    return {
      orderByClause: `sort_value ${sortDirection}`,
      sortJoin: `
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
      `,
      sortSelectColumn: ', COALESCE(sla_calc.sla_order, 1) as sort_value',
    };
  }

  // Field-based sorting - get config for specific field
  const sortConfig = getSortConfigForField(sortBy, fieldIds);

  if (sortConfig) {
    return {
      orderByClause: `sort_value ${sortDirection} NULLS LAST`,
      sortJoin: sortConfig.join,
      sortSelectColumn: sortConfig.select,
    };
  }

  // Fallback to created_at if sort column not recognized
  return {
    orderByClause: `tt.created_at ${sortDirection}`,
    sortJoin: '',
    sortSelectColumn: '',
  };
}

/**
 * Get sort configuration for field-based columns
 *
 * Each field type requires different JOINs and SELECT logic:
 * - Text fields: Direct value from field_value table
 * - Number fields: Direct numeric value
 * - Status fields: Join to status options and groups, sort by sequence
 * - User fields: Join to users table, sort by full name
 * - Select fields: Join to field options, sort by sequence
 * - Currency fields: Extract amount from JSONB
 * - Date fields: Direct date value
 * - Boolean fields: Direct boolean value
 *
 * @param sortKey - The field to sort by
 * @param fieldIds - Cached field IDs for efficient JOINs
 * @returns Object with join and select strings, or null if field not found
 */
function getSortConfigForField(
  sortKey: string,
  fieldIds: FieldIdCache,
): { join: string; select: string } | null {
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
}
