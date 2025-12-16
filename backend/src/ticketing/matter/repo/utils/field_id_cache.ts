import pool from '../../../../db/pool.js';
import logger from '../../../../utils/logger.js';

/**
 * Cache for field IDs to optimize sorting queries
 * Avoids repeated JOINs on ticketing_fields table
 */
export interface FieldIdCache {
  subject?: string;
  caseNumber?: string;
  status?: string;
  assignedTo?: string;
  priority?: string;
  contractValue?: string;
  dueDate?: string;
  urgent?: string;
}

/**
 * Singleton cache - populated on first use and reused for subsequent requests
 */
let fieldIdCache: FieldIdCache | null = null;

/**
 * Get field ID cache for optimized sorting
 *
 * This function maintains a singleton cache of field IDs to avoid repeatedly
 * querying the ticketing_fields table. The cache is initialized on first call
 * and reused for all subsequent calls.
 *
 * The cache maps common field names to their database IDs for quick lookup
 * when building sort queries.
 *
 * @returns Promise resolving to the field ID cache
 */
export async function getFieldIdCache(): Promise<FieldIdCache> {
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

/**
 * Clear the field ID cache
 *
 * Useful for testing or when field definitions change.
 * The cache will be re-initialized on next call to getFieldIdCache().
 */
export function clearFieldIdCache(): void {
  fieldIdCache = null;
}
