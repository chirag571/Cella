import test from 'node:test';
import assert from 'node:assert/strict';
import { runTask } from '../public/tasks.mjs';

test('background import parses rows and infers types', () => {
  const result = runTask('import',{text:'Name,Amount\nAlice,10'});
  assert.deepEqual(result.rows,[['Alice','10']]);
  assert.deepEqual(result.types,['text','number']);
});

test('background cleanup trims and deduplicates rows', () => {
  const result = runTask('clean',{headers:['Name'],rows:[[' Alice '],['Alice']],options:{trim:true,duplicates:true,empty:false}});
  assert.deepEqual(result.rows,[['Alice']]);
  assert.deepEqual(result.types,['text']);
  assert.ok(result.size > 0);
});

test('background task rejects unknown operations', () => {
  assert.throws(() => runTask('delete',{}),/Unknown/);
});
