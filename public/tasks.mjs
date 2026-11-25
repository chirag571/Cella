import { parseCSV, inferTypes, cleanData, serializeCSV } from './data.mjs';

export function runTask(task, payload) {
  if (task === 'import') {
    const parsed = parseCSV(payload.text);
    return {...parsed, types:inferTypes(parsed.headers, parsed.rows)};
  }
  if (task === 'clean') {
    const rows = cleanData(payload.rows, payload.options);
    return {rows, types:inferTypes(payload.headers, rows), size:new Blob([serializeCSV(payload.headers, rows, false)]).size};
  }
  throw new Error('Unknown background task.');
}
