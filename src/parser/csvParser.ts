import { ParsedCSV } from '../types/csv';

const DELIMITERS = [',', ';', '\t', '|'];

/** How many non-empty lines to sample when guessing the delimiter. */
const SAMPLE_LINES = 10;

/**
 * Split a single line on `delimiter`, ignoring delimiters inside double quotes.
 * Returns the field count.
 */
function countFields(line: string, delimiter: string): number {
  let count = 1;
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === delimiter && !inQuotes) {
      count++;
    }
  }

  return count;
}

/**
 * Pick the delimiter that splits the sampled lines into the most fields while
 * staying consistent between lines — a quoted comma inside a semicolon-delimited
 * file no longer wins, because it only appears on some rows.
 */
function detectDelimiter(csv: string, fileName?: string): string {
  if (fileName && fileName.toLowerCase().endsWith('.tsv')) {
    return '\t';
  }

  // Sampling whole lines is only approximate for quoted newlines, but it is
  // enough to rank candidate delimiters.
  const lines = csv
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .slice(0, SAMPLE_LINES);

  if (lines.length === 0) return ',';

  let best = ',';
  let bestScore = -1;

  for (const delimiter of DELIMITERS) {
    const counts = lines.map((line) => countFields(line, delimiter));
    const first = counts[0];
    if (first < 2) continue;

    const consistent = counts.every((count) => count === first);
    // Consistency matters more than raw field count.
    const score = first * (consistent ? 10 : 1);

    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }

  return best;
}

export function parseCSV(csv: string, fileName?: string): ParsedCSV {
  const delimiter = detectDelimiter(csv, fileName);

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

  // Pad short rows so every row can be indexed by column position.
  for (const r of rows) {
    while (r.length < headers.length) {
      r.push('');
    }
  }

  return {
    headers,
    rows,
    rowCount: rows.length,
  };
}
