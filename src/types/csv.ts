export type ColumnType = 'text' | 'image' | 'link' | 'html' | 'raw' | 'base64' | 'json' | 'array' | 'number' | 'bool' | 'date';

export interface ParsedCSV {
  headers: readonly string[];
  rows: readonly string[][];
  rowCount: number;
}

export interface ColumnMeta {
  name: string;
  type: ColumnType;
  visible: boolean;
  filter?: string;
}