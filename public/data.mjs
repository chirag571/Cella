/** CSV parsing and transformations. Pure functions, shared by the UI and tests. */
export function detectDelimiter(text) {
  return [',', ';', '\t'].map(delimiter => {
    let quoted = false, count = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (quoted && text[i + 1] === '"') i++;
        else quoted = !quoted;
      } else if (!quoted && (c === '\n' || c === '\r')) break;
      else if (!quoted && c === delimiter) count++;
    }
    return { delimiter, count };
  }).sort((a, b) => b.count - a.count)[0].delimiter;
}

export function parseCSV(source) {
  const text = source.replace(/^\uFEFF/, '');
  if (!text.trim()) throw new Error('This file is empty. Choose a CSV with a header and some data.');
  const delimiter = detectDelimiter(text);
  const records = [];
  let row = [], value = '', quoted = false, closed = false;
  const pushRow = () => {
    row.push(value);
    if (row.some(cell => cell.trim() !== '')) records.push(row);
    row = []; value = ''; closed = false;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { value += '"'; i++; }
        else { quoted = false; closed = true; }
      } else value += c;
    } else if (c === '"' && value === '' && !closed) quoted = true;
    else if (c === delimiter) { row.push(value); value = ''; closed = false; }
    else if (c === '\n' || c === '\r') {
      pushRow(); if (c === '\r' && text[i + 1] === '\n') i++;
    } else if (closed && c.trim()) throw new Error('Unexpected text after a closing quote. Please check the CSV format.');
    else if (c === '"') throw new Error('A quote inside a cell must be escaped as two quotes inside a quoted field.');
    else if (!closed) value += c;
  }
  if (quoted) throw new Error('A quoted cell is missing its closing quote.');
  if (value !== '' || row.length || closed) pushRow();
  if (!records.length) throw new Error('No data found in this file.');
  const used = new Set();
  const headers = records[0].map((raw, index) => {
    const base = raw.trim() || `Column ${index + 1}`;
    let name = base, n = 2;
    while (used.has(name)) name = `${base} (${n++})`;
    used.add(name); return name;
  });
  let padded = 0;
  const rows = records.slice(1).map((record, index) => {
    if (record.length > headers.length) throw new Error(`Row ${index + 2} has ${record.length} values but the header has ${headers.length} columns.`);
    if (record.length < headers.length) padded++;
    return headers.map((_, i) => record[i] ?? '');
  });
  return { headers, rows, delimiter, padded };
}

export function toNumber(value) {
  const text = String(value).trim();
  if (!text) return NaN;
  const cleaned = text.replace(/^[$€£₹]\s*/, '').replace(/,/g, '');
  return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(cleaned) ? Number(cleaned) : NaN;
}
export function inferTypes(headers, rows) {
  return headers.map((header, i) => {
    if (/\b(id|zip|postal|phone|code)\b/i.test(header)) return 'text';
    let found = false, dates = true, numbers = true;
    for (const row of rows) {
      const value = String(row[i] ?? '');
      if (!value.trim()) continue;
      found = true;
      if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) || Number.isNaN(Date.parse(value))) dates = false;
      if (!Number.isFinite(toNumber(value)) || /^0\d+/.test(value.trim())) numbers = false;
      if (!dates && !numbers) return 'text';
    }
    return !found ? 'text' : dates ? 'date' : numbers ? 'number' : 'text';
  });
}
export function matchesFilter(row, filter, types) {
  const raw = String(row[filter.column] ?? ''), value = raw.toLowerCase().trim();
  const expected = String(filter.value ?? '').toLowerCase().trim();
  const op = filter.operator;
  if (op === 'empty') return value === '';
  if (op === 'not_empty') return value !== '';
  if (op === 'contains') return value.includes(expected);
  if (op === 'not_contains') return !value.includes(expected);
  if (op === 'starts') return value.startsWith(expected);
  const convert = types[filter.column] === 'number' ? toNumber : types[filter.column] === 'date' ? Date.parse : v => String(v).trim().toLowerCase();
  const a = convert(raw), b = convert(filter.value);
  if (op === 'eq') return a === b;
  if (op === 'neq') return a !== b;
  if (!value || Number.isNaN(a) || Number.isNaN(b)) return false;
  if (op === 'gt') return a > b;
  if (op === 'gte') return a >= b;
  if (op === 'lt') return a < b;
  if (op === 'lte') return a <= b;
  return true;
}
export function queryRows(dataset, state = {}) {
  const query = (state.query || '').toLowerCase().trim();
  let rows = [];
  for (let index = 0; index < dataset.rows.length; index++) {
    const values = dataset.rows[index];
    if (query && !values.some(v => String(v).toLowerCase().includes(query))) continue;
    if (state.filters?.length && !state.filters.every(f => matchesFilter(values, f, dataset.types))) continue;
    rows.push({values,index});
  }
  if (state.sort) {
    const { column, direction } = state.sort;
    rows.sort((a, b) => {
      const av = a.values[column], bv = b.values[column];
      if (av === '' && bv !== '') return 1;
      if (bv === '' && av !== '') return -1;
      const result = dataset.types[column] === 'number' ? toNumber(av) - toNumber(bv)
        : dataset.types[column] === 'date' ? Date.parse(av) - Date.parse(bv)
        : av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' });
      return (direction === 'asc' ? result : -result) || a.index - b.index;
    });
  }
  return rows;
}
export function serializeCSV(headers, rows, protectFormulas = true) {
  const escape = raw => {
    let value = String(raw ?? '');
    const trimmed = value.trimStart();
    if (protectFormulas && (/^[=+@\t\r]/.test(value) || /^[=+@]/.test(trimmed) || (/^-/.test(trimmed) && !Number.isFinite(toNumber(value))))) value = "'" + value;
    return /[",\n\r]/.test(value) ? '"' + value.replaceAll('"', '""') + '"' : value;
  };
  return [headers, ...rows].map(row => row.map(escape).join(',')).join('\r\n');
}
export function cleanData(rows, options) {
  let result = rows.map(row => row.map(value => options.trim ? value.trim() : value));
  if (options.empty) result = result.filter(row => row.some(value => value.trim() !== ''));
  if (options.duplicates) {
    const seen = new Set();
    result = result.filter(row => { const key = JSON.stringify(row); if (seen.has(key)) return false; seen.add(key); return true; });
  }
  return result;
}
export function makeSample() {
  const headers = ['Order ID', 'Customer', 'Product', 'Category', 'Amount', 'Status', 'Order date', 'Country'];
  const names = ['Olivia Rhye','Phoenix Baker','Lana Steiner','Demi Wilkinson','Drew Cano','Natali Craig','Orlando Diggs','Andi Lane','Kate Morrison','Noah Williams','Mia Thompson','James Wilson','Ava Robinson','Liam Parker','Sofia Chen','Ethan Miller'];
  const products = [['Everyday tote','Accessories','48.00'],['Ceramic coffee mug','Home & living','24.00'],['Linen blend shirt','Clothing','89.00'],['Desk essentials kit','Stationery','36.00'],['Canvas sneakers','Footwear','120.00'],['Botanical candle','Home & living','32.00'],['Weekly planner','Stationery','28.00'],['Cotton crew tee','Clothing','45.00'],['Leather cardholder','Accessories','54.00'],['Cloud slippers','Footwear','42.00'],['Glass water bottle','Accessories','29.00'],['Woven throw','Home & living','68.00']];
  const statuses = ['Completed','Completed','Processing','Completed','Pending','Completed','Completed','Processing'];
  const countries = ['United States','United Kingdom','Australia','Canada','India','Germany'];
  const rows = Array.from({length:248}, (_, i) => {
    const p = products[i % products.length];
    const date = new Date(Date.UTC(2026, 10, 17 - Math.floor(i / 9))).toISOString().slice(0,10);
    return [`#MT-${1048+i}`,names[i%names.length],p[0],p[1],p[2],statuses[i%statuses.length],date,countries[i%countries.length]];
  });
  return {id:'sample-sales',name:'sales_overview.csv',headers,rows,types:inferTypes(headers,rows),size:new TextEncoder().encode(serializeCSV(headers,rows,false)).length,imported:Date.now(),sample:true};
}
