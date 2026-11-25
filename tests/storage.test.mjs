import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDataset, normalizeView } from '../public/storage.mjs';

const dataset = {id:'d1',name:'data.csv',headers:['Name','Amount'],rows:[['Alice','10']],types:['text','number'],size:12,imported:1};

test('rejects malformed persisted datasets and normalizes safe metadata', () => {
  assert.equal(normalizeDataset({...dataset,rows:[['too short']]}),null);
  assert.equal(normalizeDataset({...dataset,types:['html','number']}),null);
  assert.deepEqual(normalizeDataset(dataset).rows,[['Alice','10']]);
});

test('normalizes saved views and removes invalid columns and filters', () => {
  const view = normalizeView({id:'v1',name:'Long view',datasetId:'d1',query:12,filters:[{column:1,operator:'gt',value:'5'},{column:9,operator:'eq',value:'x'}],sort:{column:9,direction:'asc'},columns:[1,1,8],pageSize:999,density:'unknown',created:2},[dataset]);
  assert.equal(view.query,'');
  assert.deepEqual(view.filters,[{column:1,operator:'gt',value:'5'}]);
  assert.deepEqual(view.columns,[1]);
  assert.equal(view.sort,null);
  assert.equal(view.pageSize,8);
  assert.equal(view.density,'comfortable');
  assert.equal(normalizeView({...view,datasetId:'missing'},[dataset]),null);
});
