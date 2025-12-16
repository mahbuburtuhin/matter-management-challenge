/**
 * Sortable column constants for Matter list
 *
 * IMPORTANT: These constants must match between frontend and backend.
 * See: backend/src/ticketing/matter/constants/sortable-columns.ts
 *
 * When adding new sortable columns:
 * 1. Add the constant here
 * 2. Add the corresponding constant in backend
 * 3. Add sorting logic in MatterRepo.getSortConfig()
 * 4. Update SortableColumn type
 */

export const SORTABLE_COLUMNS = {
  SUBJECT: 'subject',
  CASE_NUMBER: 'case_number',
  STATUS: 'status',
  ASSIGNED_TO: 'assigned_to',
  PRIORITY: 'priority',
  CONTRACT_VALUE: 'contract_value',
  DUE_DATE: 'due_date',
  URGENT: 'urgent',
  CREATED_AT: 'created_at',
  UPDATED_AT: 'updated_at',
  RESOLUTION_TIME: 'resolution_time',
  SLA: 'sla',
} as const;

// Type-safe union of all valid sort column values
export type SortableColumn = typeof SORTABLE_COLUMNS[keyof typeof SORTABLE_COLUMNS];

// Helper to validate sort column at runtime
export function isValidSortColumn(column: string): column is SortableColumn {
  return Object.values(SORTABLE_COLUMNS).includes(column as SortableColumn);
}

// Default sort configuration
export const DEFAULT_SORT = {
  column: SORTABLE_COLUMNS.CREATED_AT,
  order: 'desc' as const,
};

// Human-readable labels for display (maps internal column names to UI labels)
export const COLUMN_LABELS: Record<SortableColumn, string> = {
  [SORTABLE_COLUMNS.SUBJECT]: 'Subject',
  [SORTABLE_COLUMNS.CASE_NUMBER]: 'Case Number',
  [SORTABLE_COLUMNS.STATUS]: 'Status',
  [SORTABLE_COLUMNS.ASSIGNED_TO]: 'Assigned To',
  [SORTABLE_COLUMNS.PRIORITY]: 'Priority',
  [SORTABLE_COLUMNS.CONTRACT_VALUE]: 'Contract Value',
  [SORTABLE_COLUMNS.DUE_DATE]: 'Due Date',
  [SORTABLE_COLUMNS.URGENT]: 'Urgent',
  [SORTABLE_COLUMNS.CREATED_AT]: 'Created At',
  [SORTABLE_COLUMNS.UPDATED_AT]: 'Updated At',
  [SORTABLE_COLUMNS.RESOLUTION_TIME]: 'Resolution Time',
  [SORTABLE_COLUMNS.SLA]: 'SLA',
};
