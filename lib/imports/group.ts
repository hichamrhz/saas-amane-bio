import { GLOBAL_FIELD_KEYS, type ColumnMapping, type ImportFieldKey } from "./mapping";
import { blankToNull } from "./normalize";

export type RawLine = {
  rowNumber: number;
  sku: string | null;
  quantity: string | null;
  unitPrice: string | null;
  discount: string | null;
};

export type RawGroup = {
  orderNumber: string | null;
  rowNumbers: number[];
  globals: Partial<Record<ImportFieldKey, string>>;
  contradiction: string | null;
  lines: RawLine[];
};

/**
 * Groups raw spreadsheet rows into one entry per order number ("une ligne
 * par article, même numéro de commande" — cahier des charges §9). Rows
 * without an order number each become their own single-row group (reported
 * invalid downstream — an order can't be identified without one). A global
 * field is only ever set once per group from its first non-blank value;
 * a later row supplying a DIFFERENT non-blank value for the same global
 * field is a contradiction, flagged rather than silently overwritten.
 */
export function groupImportRows(
  rows: string[][],
  header: string[],
  mapping: ColumnMapping
): RawGroup[] {
  const columnByField = new Map<ImportFieldKey, number>();
  header.forEach((h, index) => {
    const field = mapping[h];
    if (field) columnByField.set(field, index);
  });

  const groups = new Map<string, RawGroup>();
  const ungrouped: RawGroup[] = [];

  rows.forEach((row, rowIndex) => {
    const rowNumber = rowIndex + 2; // +1 for 0-index, +1 for the header row
    const get = (field: ImportFieldKey) => {
      const col = columnByField.get(field);
      return col === undefined ? null : blankToNull(row[col]);
    };

    const orderNumber = get("orderNumber");
    const line: RawLine = {
      rowNumber,
      sku: get("sku"),
      quantity: get("quantity"),
      unitPrice: get("unitPrice"),
      discount: get("discount"),
    };

    if (!orderNumber) {
      ungrouped.push({ orderNumber: null, rowNumbers: [rowNumber], globals: {}, contradiction: null, lines: [line] });
      return;
    }

    let group = groups.get(orderNumber);
    if (!group) {
      group = { orderNumber, rowNumbers: [], globals: {}, contradiction: null, lines: [] };
      groups.set(orderNumber, group);
    }
    group.rowNumbers.push(rowNumber);
    group.lines.push(line);

    for (const field of GLOBAL_FIELD_KEYS) {
      const value = get(field);
      if (value === null) continue;
      const existing = group.globals[field];
      if (existing === undefined) {
        group.globals[field] = value;
      } else if (existing !== value && !group.contradiction) {
        group.contradiction = `Valeur contradictoire pour "${field}" entre les lignes de la commande ${orderNumber} (${existing} vs ${value}).`;
      }
    }
  });

  return [...groups.values(), ...ungrouped];
}
