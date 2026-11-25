import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, inferTypes, queryRows, serializeCSV, cleanData, makeSample } from '../public/data.mjs';

test('parses BOM, CRLF, commas inside quotes, escaped quotes, and multiline cells', () => {
  const result = parseCSV('\uFEFFName,Note,Amount\r\n"Doe, Jane","said ""hello""\nnext line",42\r\n');
  assert.deepEqual(result.headers, ['Name','Note','Amount']);
  assert.deepEqual(result.rows, [['Doe, Jane','said "hello"\nnext line','42']]);
});
test('detects semicolon and tab delimiters without counting quoted separators', () => {
  assert.deepEqual(parseCSV('Name;Value\n"a,b";12').rows, [['a,b','12']]);
  assert.deepEqual(parseCSV('Name\tValue\nAlice\t12').rows, [['Alice','12']]);
});
test('preserves trailing empty cells and pads short rows', () => {
  const result = parseCSV('A,B,C\n1,2,\n3');
  assert.deepEqual(result.rows, [['1','2',''],['3','','']]);
  assert.equal(result.padded, 1);
});
test('rejects malformed CSV instead of discarding extra values', () => {
  assert.throws(() => parseCSV('A,B\n1,2,3'), /3 values/);
  assert.throws(() => parseCSV('A,B\n"unfinished,2'), /closing quote/);
  assert.throws(() => parseCSV('A,B\n"a"x,2'), /Unexpected/);
  assert.throws(() => parseCSV('A,B\na"b,2'), /quote inside/);
  assert.throws(() => parseCSV(' \n'), /empty/);
});
test('makes duplicate and empty column headers unique', () => {
  assert.deepEqual(parseCSV('A,A,,A (2)\n1,2,3,4').headers, ['A','A (2)','Column 3','A (2) (2)']);
});
test('header-only and single-column files are valid', () => {
  assert.deepEqual(parseCSV('A,B').rows, []);
  assert.deepEqual(parseCSV('Name\nAlice\nBob').rows, [['Alice'],['Bob']]);
});
test('infers number and date columns while preserving identifiers and leading zeros', () => {
  assert.deepEqual(inferTypes(['ID','Amount','Date','Name','Reference'], [['001','32.5','2026-11-18','Alice','0022']]), ['text','number','date','text','text']);
});
test('checks the whole column before choosing numeric comparison', () => {
  const rows = Array.from({length:1001}, (_,i) => [i === 1000 ? 'unknown' : '12']);
  assert.deepEqual(inferTypes(['Value'],rows), ['text']);
});
test('combines search, AND conditions, and numeric sorting', () => {
  const d = {headers:['Name','Amount','Status'],rows:[['Alice','10','Done'],['ALICE','2','Done'],['Alice','30','Pending'],['Bob','50','Done']],types:['text','number','text']};
  const rows = queryRows(d,{query:'alice',filters:[{column:2,operator:'eq',value:'Done'},{column:1,operator:'gte',value:'2'}],sort:{column:1,direction:'asc'}});
  assert.deepEqual(rows.map(row => row.index), [1,0]);
});
test('date and empty-cell filters select the correct rows', () => {
  const d = {headers:['Date','Note'],rows:[['2026-11-17',''],['2026-11-18','x'],['2026-11-19','']],types:['date','text']};
  assert.deepEqual(queryRows(d,{filters:[{column:0,operator:'gt',value:'2026-11-17'},{column:1,operator:'empty'}]}).map(row => row.index), [2]);
});
test('sorting keeps blanks last and leaves original rows unchanged', () => {
  const d = {headers:['Value'],rows:[[''],['2'],['10']],types:['number']};
  assert.deepEqual(queryRows(d,{sort:{column:0,direction:'desc'}}).map(row => row.index), [2,1,0]);
  assert.equal(d.rows[0][0], '');
});
test('cleanup trims before deduplicating and preserves original data', () => {
  const original = [[' A ','1'],['A','1'],['',' ']];
  assert.deepEqual(cleanData(original,{trim:true,duplicates:true,empty:true}), [['A','1']]);
  assert.equal(original[0][0], ' A ');
});
test('CSV export round-trips unicode, commas, line breaks and quotes', () => {
  const headers = ['Name','Note'], rows = [['Chirag','hello, "world"'],['José','line one\nline two']];
  assert.deepEqual(parseCSV(serializeCSV(headers,rows)).rows, rows);
});
test('safe export neutralizes formulas and preserves negative numbers', () => {
  assert.equal(serializeCSV(['A'],[['=SUM(A1)'],['@calc'],['-20'],['-command'],['  =SUM(A1)']]), "A\r\n'=SUM(A1)\r\n'@calc\r\n-20\r\n'-command\r\n'  =SUM(A1)");
});
test('sample metrics come from 248 real fictional sample records', () => {
  const d = makeSample();
  assert.equal(d.rows.length,248); assert.equal(d.headers.length,8); assert.ok(d.size > 1000);
  assert.ok(d.rows.every(row => row.length === 8 && row.every(cell => cell !== '')));
});
test('exporting a filtered column subset gives the expected CSV', () => {
  const d = makeSample();
  const rows = queryRows(d,{filters:[{column:5,operator:'eq',value:'Completed'},{column:4,operator:'gt',value:'40'}],sort:{column:4,direction:'asc'}});
  const columns = [1,4,5];
  const result = parseCSV(serializeCSV(columns.map(c => d.headers[c]),rows.map(row => columns.map(c => row.values[c]))));
  assert.equal(result.rows.length,81);
  assert.deepEqual(result.headers,['Customer','Amount','Status']);
  assert.ok(result.rows.every(row => Number(row[1]) > 40 && row[2] === 'Completed'));
});
