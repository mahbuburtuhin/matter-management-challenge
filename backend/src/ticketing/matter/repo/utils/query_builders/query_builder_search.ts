/**
 * Result of building a search condition
 */
export interface SearchQueryResult {
  condition: string;
  params: (string | number)[];
  paramStartIndex: number;
}

/**
 * Builds a WHERE clause for searching across multiple field types
 *
 * This function creates a comprehensive search condition that searches across:
 * - Text fields (subject, description) with exact and fuzzy matching
 * - Number fields (case number) converted to text
 * - Status fields (by label)
 * - Select fields like Priority (by label)
 * - User fields (first name, last name, email, full name)
 * - Currency fields (by amount)
 * - Boolean fields
 * - Date fields (formatted as YYYY-MM-DD)
 *
 * Uses PostgreSQL pg_trgm extension for fuzzy matching with a similarity
 * threshold of 30% to handle typos and partial matches.
 *
 * @param search - The search term to filter by (optional)
 * @param paramStartIndex - Starting index for SQL parameters (e.g., $1, $2)
 * @returns Object containing the WHERE condition string, parameter values, and next param index
 *
 * @example
 * const { condition, params, paramStartIndex } = buildSearchCondition("john", 1);
 * // condition: "AND (ttfv.text_value ILIKE $1 OR ...)"
 * // params: ["%john%", "john"]
 * // paramStartIndex: 3
 */
export function buildSearchCondition(
  search: string | undefined,
  paramStartIndex: number,
): SearchQueryResult {
  // No search term provided - return empty condition
  if (!search || search.trim().length === 0) {
    return {
      condition: '',
      params: [],
      paramStartIndex,
    };
  }

  const searchTerm = search.trim();
  const searchPattern = `%${searchTerm}%`;

  // Parameters: pattern for ILIKE, term for similarity()
  const params: (string | number)[] = [searchPattern, searchTerm];

  // Similarity threshold: 0.3 = 30% similar (good for typo tolerance)
  const similarityThreshold = 0.3;

  // Build comprehensive search condition across all field types
  const condition = `AND (
    -- Text fields (subject, Description) - Exact + Fuzzy
    ttfv.text_value ILIKE $${paramStartIndex}
    OR ttfv.string_value ILIKE $${paramStartIndex}
    OR similarity(ttfv.text_value, $${paramStartIndex + 1}) > ${similarityThreshold}
    OR similarity(ttfv.string_value, $${paramStartIndex + 1}) > ${similarityThreshold}

    -- Number fields (Case Number)
    OR ttfv.number_value::TEXT ILIKE $${paramStartIndex}

    -- Status fields - Exact + Fuzzy
    OR EXISTS (
      SELECT 1 FROM ticketing_field_status_options tfso
      WHERE tfso.id = ttfv.status_reference_value_uuid
      AND (
        tfso.label ILIKE $${paramStartIndex}
        OR similarity(tfso.label, $${paramStartIndex + 1}) > ${similarityThreshold}
      )
    )

    -- Select fields (Priority) - Exact + Fuzzy
    OR EXISTS (
      SELECT 1 FROM ticketing_field_options tfo
      WHERE tfo.id = ttfv.select_reference_value_uuid
      AND (
        tfo.label ILIKE $${paramStartIndex}
        OR similarity(tfo.label, $${paramStartIndex + 1}) > ${similarityThreshold}
      )
    )

    -- User fields (Assigned To) - Exact + Fuzzy
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = ttfv.user_value
      AND (
        u.first_name ILIKE $${paramStartIndex}
        OR u.last_name ILIKE $${paramStartIndex}
        OR u.email ILIKE $${paramStartIndex}
        OR CONCAT(u.first_name, ' ', u.last_name) ILIKE $${paramStartIndex}
        OR similarity(u.first_name, $${paramStartIndex + 1}) > ${similarityThreshold}
        OR similarity(u.last_name, $${paramStartIndex + 1}) > ${similarityThreshold}
        OR similarity(CONCAT(u.first_name, ' ', u.last_name), $${paramStartIndex + 1}) > ${similarityThreshold}
      )
    )

    -- Currency fields (Contract Value)
    OR (ttfv.currency_value->>'amount')::TEXT ILIKE $${paramStartIndex}

    -- Boolean fields (Urgent)
    OR ttfv.boolean_value::TEXT ILIKE $${paramStartIndex}

    -- Date fields (Due Date)
    OR TO_CHAR(ttfv.date_value, 'YYYY-MM-DD') ILIKE $${paramStartIndex}
  )`;

  return {
    condition,
    params,
    paramStartIndex: paramStartIndex + 2, // We used 2 parameters
  };
}
