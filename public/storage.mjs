const validTypes = new Set(['text','number','date']);
const validOperators = new Set(['contains','not_contains','starts','eq','neq','gt','gte','lt','lte','empty','not_empty']);

export function normalizeDataset(value) {
  if (!value || typeof value !== 'object' || typeof value.id !== 'string' || typeof value.name !== 'string' || !Array.isArray(value.headers) || !value.headers.length || !value.headers.every(h => typeof h === 'string') || !Array.isArray(value.rows)) return null;
  const width = value.headers.length;
  if (!value.rows.every(row => Array.isArray(row) && row.length === width && row.every(cell => typeof cell === 'string'))) return null;
  if (!Array.isArray(value.types) || value.types.length !== width || !value.types.every(type => validTypes.has(type))) return null;
  return {...value, size:Number.isFinite(value.size) && value.size >= 0 ? value.size : 0, imported:Number.isFinite(value.imported) ? value.imported : Date.now(), sample:false};
}

export function normalizeView(value, datasets) {
  if (!value || typeof value !== 'object' || typeof value.id !== 'string' || typeof value.name !== 'string' || typeof value.datasetId !== 'string') return null;
  const dataset = datasets.find(item => item.id === value.datasetId);
  if (!dataset) return null;
  const filters = Array.isArray(value.filters) ? value.filters.filter(f => Number.isInteger(f?.column) && f.column >= 0 && f.column < dataset.headers.length && validOperators.has(f.operator) && typeof f.value === 'string') : [];
  const columns = Array.isArray(value.columns) ? [...new Set(value.columns.filter(c => Number.isInteger(c) && c >= 0 && c < dataset.headers.length))] : [];
  const sort = Number.isInteger(value.sort?.column) && value.sort.column >= 0 && value.sort.column < dataset.headers.length && ['asc','desc'].includes(value.sort.direction) ? {column:value.sort.column,direction:value.sort.direction} : null;
  return {id:value.id,name:value.name.slice(0,80),datasetId:value.datasetId,query:typeof value.query === 'string' ? value.query : '',filters,sort,columns:columns.length ? columns : dataset.headers.map((_,i) => i),pageSize:[8,15,25,50,100,500].includes(value.pageSize) ? value.pageSize : 8,density:value.density === 'compact' ? 'compact' : 'comfortable',created:Number.isFinite(value.created) ? value.created : Date.now()};
}
