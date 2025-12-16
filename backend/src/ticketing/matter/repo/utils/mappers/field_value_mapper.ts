import { FieldValue, FieldType, CurrencyValue, UserValue, StatusValue } from '../../../../types.js';

/**
 * Interface for raw database row containing field value data
 */
export interface FieldValueRow {
  field_name: string;
  field_type: string;
  ticket_field_id: string;
  text_value?: string | null;
  string_value?: string | null;
  number_value?: string | null;
  date_value?: Date | null;
  boolean_value?: boolean | null;
  currency_value?: CurrencyValue | null;
  user_value?: number | null;
  select_reference_value_uuid?: string | null;
  status_reference_value_uuid?: string | null;
  // Joined user data
  user_id?: number | null;
  user_email?: string | null;
  user_first_name?: string | null;
  user_last_name?: string | null;
  // Joined select option data
  select_option_label?: string | null;
  // Joined status option data
  status_option_label?: string | null;
  status_group_name?: string | null;
}

/**
 * Maps a single database row to a FieldValue object
 *
 * Handles all field types and their display value formatting:
 * - text: Direct value
 * - number: Formatted with locale
 * - date: Formatted as locale date string
 * - boolean: Checkmark or X
 * - currency: Amount with currency symbol
 * - user: Full name from joined user data
 * - select: Label from joined option data
 * - status: Label from joined status data with group metadata
 */
export function mapFieldValueRow(row: FieldValueRow): FieldValue {
  let value: string | number | boolean | Date | CurrencyValue | UserValue | StatusValue | null = null;
  let displayValue: string | undefined = undefined;

  switch (row.field_type) {
    case 'text':
      value = row.text_value || row.string_value || null;
      break;

    case 'number':
      value = row.number_value ? parseFloat(row.number_value) : null;
      displayValue = value !== null ? value.toLocaleString() : undefined;
      break;

    case 'date':
      value = row.date_value || null;
      displayValue = row.date_value ? new Date(row.date_value).toLocaleDateString() : undefined;
      break;

    case 'boolean':
      value = row.boolean_value ?? null;
      displayValue = row.boolean_value ? '✓' : '✗';
      break;

    case 'currency':
      value = row.currency_value || null;
      if (row.currency_value) {
        displayValue = `${row.currency_value.amount.toLocaleString()} ${row.currency_value.currency}`;
      }
      break;

    case 'user':
      if (row.user_id) {
        const userValue: UserValue = {
          id: row.user_id,
          email: row.user_email!,
          firstName: row.user_first_name!,
          lastName: row.user_last_name!,
          displayName: `${row.user_first_name} ${row.user_last_name}`,
        };
        value = userValue;
        displayValue = userValue.displayName;
      }
      break;

    case 'select':
      value = row.select_reference_value_uuid || null;
      displayValue = row.select_option_label || undefined;
      break;

    case 'status':
      value = row.status_reference_value_uuid || null;
      displayValue = row.status_option_label || undefined;
      // Store group name in metadata for SLA calculations
      if (row.status_group_name && row.status_reference_value_uuid) {
        value = {
          statusId: row.status_reference_value_uuid,
          groupName: row.status_group_name,
        } as StatusValue;
      }
      break;
  }

  return {
    fieldId: row.ticket_field_id,
    fieldName: row.field_name,
    fieldType: row.field_type as FieldType,
    value,
    displayValue,
  };
}

/**
 * Maps an array of database rows to a Record of FieldValue objects
 * keyed by field name
 *
 * @param rows - Array of database rows from field value query
 * @returns Record mapping field names to their FieldValue objects
 */
export function mapFieldValueRows(rows: FieldValueRow[]): Record<string, FieldValue> {
  const fields: Record<string, FieldValue> = {};

  for (const row of rows) {
    fields[row.field_name] = mapFieldValueRow(row);
  }

  return fields;
}
