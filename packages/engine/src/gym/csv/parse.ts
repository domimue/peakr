/**
 * A small RFC 4180-style CSV reader for gym-app exports: detects `,` `;` or tab, handles a BOM,
 * CRLF / LF / CR line ends, quoted fields with delimiters, line breaks and doubled quotes, and
 * skips blank lines.
 */

export interface CsvTable {
  delimiter: string;
  headers: string[];
  /** Data rows, each padded / cut to the header length. */
  rows: string[][];
  /** 1-based line number in the file of each data row (for error messages). */
  lineNumbers: number[];
}

const DELIMITERS = [',', ';', '\t'] as const;

/** The delimiter that appears most often in the first line outside quotes. */
export function detectDelimiter(text: string): string {
  let inQuotes = false;
  const counts = new Map<string, number>();
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === '\n' || ch === '\r')) break;
    else if (!inQuotes && (DELIMITERS as readonly string[]).includes(ch)) {
      counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
  }
  let best: string = ',';
  let bestCount = 0;
  for (const d of DELIMITERS) {
    const n = counts.get(d) ?? 0;
    if (n > bestCount) [best, bestCount] = [d, n];
  }
  return best;
}

/** Splits CSV text into records of fields, with the 1-based line each record starts on. */
export function parseRecords(
  text: string,
  delimiter: string,
): { fields: string[]; line: number }[] {
  const records: { fields: string[]; line: number }[] = [];
  let fields: string[] = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;
  const endField = () => {
    fields.push(field);
    field = '';
  };
  const endRecord = () => {
    endField();
    records.push({ fields, line: recordLine });
    fields = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else {
        if (ch === '\n' || (ch === '\r' && text[i + 1] !== '\n')) line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field.trim() === '') {
      field = '';
      inQuotes = true;
    } else if (ch === delimiter) endField();
    else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRecord();
      line++;
      recordLine = line;
    } else field += ch;
  }
  if (field !== '' || fields.length > 0) endRecord();
  return records;
}

export function parseCsv(input: string): CsvTable {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const delimiter = detectDelimiter(text);
  const records = parseRecords(text, delimiter).filter((r) =>
    r.fields.some((f) => f.trim() !== ''),
  );
  const [head, ...data] = records;
  const headers = (head?.fields ?? []).map((h) => h.trim());
  return {
    delimiter,
    headers,
    rows: data.map((r) => headers.map((_, i) => (r.fields[i] ?? '').trim())),
    lineNumbers: data.map((r) => r.line),
  };
}
