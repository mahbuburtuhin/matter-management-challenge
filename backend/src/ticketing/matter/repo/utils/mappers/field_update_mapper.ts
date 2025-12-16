import { CurrencyValue, UserValue, StatusValue } from '../../../../types.js';

/**
 * Result of mapping a field type and value to a database column
 */
export interface UpdateColumnMapping {
  columnName: string;
  columnValue: string | number | boolean | Date | null;
}

/**
 * Maps a field type and value to the appropriate database column name and value
 *
 * This function determines which column in ticketing_ticket_field_value table
 * should be updated based on the field type. Each field type has a dedicated
 * column for its value (text_value, number_value, date_value, etc.)
 *
 * @param fieldType - The type of field (text, number, date, boolean, currency, user, select, status)
 * @param value - The value to be stored
 * @returns Object containing the column name and formatted column value
 * @throws Error if field type is unsupported
 */
export function getUpdateColumnMapping(
  fieldType: string,
  value: string | number | boolean | Date | CurrencyValue | UserValue | StatusValue | null,
): UpdateColumnMapping {
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

    case 'status':
      columnName = 'status_reference_value_uuid';
      columnValue = value as string;
      break;

    default:
      throw new Error(`Unsupported field type: ${fieldType}`);
  }

  return { columnName, columnValue };
}
