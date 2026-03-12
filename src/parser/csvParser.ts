import { ParsedCSV } from '../types/csv';

// the csv is from vscode
// const document = editor.document;
// const csvText = document.getText(); ==> ths is a string
function detectDelimiter(csv: string): string {
  const line = csv
    .split(/\r?\n/) // the line split on either \r or \n
    .find(l => l.trim().length > 0);

  if (!line) return ',';

  const delimiters = [',', ';', '\t', '|'];
  let best = ',';
  let max = 0;

  // loop over the delimiters and detect which one of them return the most column
  for (const d of delimiters) {
    const count = line.split(d).length - 1;
    if (count > max) {
      max = count;
      best = d;
    }
  }

  return best;
}


export function parseCSV(csv: string): ParsedCSV {
  const delimiter = detectDelimiter(csv);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    const n = csv[i + 1];

    if (c === '"') {
      if (inQuotes && n === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === delimiter && !inQuotes) {
      row.push(field);
      field = '';
    } else if ((c === '\n' || c === '\r') && !inQuotes) {
      if (c === '\r' && n === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const headers = rows.shift() ?? [];

  return {
    headers,
    rows,
    rowCount: rows.length,
  };
}