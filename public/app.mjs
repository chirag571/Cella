import { queryRows, serializeCSV, makeSample, toNumber } from './data.mjs';
import { normalizeDataset, normalizeView } from './storage.mjs';

// Inline SVG icons keep the application self-contained and usable offline.
const paths = {
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  table: 'M3 4h18v16H3zM3 9h18M3 14h18M9 4v16',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 12h8M8 16h8',
  folder: 'M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  bookmark: 'M6 3h12v18l-6-4-6 4z', down: 'm7 10 5 5 5-5', chevron: 'm9 5 7 7-7 7', left: 'm15 5-7 7 7 7',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5',
  download: 'M12 3v13m-5-5 5 5 5-5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4',
  arrow: 'M5 12h14m-5-5 5 5-5 5', arrowup: 'M7 17 17 7M7 7h10v10', check: 'm5 12 4 4L19 6',
  circlecheck: 'M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14l-3-3',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  filter: 'M3 5h18M6 12h12M10 19h4M8 3v4M16 10v4M12 17v4',
  columns: 'M3 4h18v16H3zM9 4v16M15 4v16', rows: 'M3 4h18v16H3zM3 9h18M3 15h18',
  menu: 'M4 6h16M4 12h16M4 18h16', compact: 'M4 5h16M4 9h16M4 13h16M4 17h16',
  help: 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3m.1 4h.01M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0',
  shield: 'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6zM8 12l3 3 5-6', lock: 'M5 10h14v11H5zM8 10V6a4 4 0 0 1 8 0v4',
  spark: 'm12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6z',
  leaf: 'M12 21V11M12 15C5 15 3 11 3 6c7 0 9 4 9 9ZM12 12c0-6 3-9 9-9 0 6-3 9-9 9Z',
  close: 'M6 6l12 12M6 18 18 6', plus: 'M12 5v14M5 12h14', sort: 'm8 4-4 4m4-4v16m8 0 4-4m-4 4V4',
  sortasc: 'M12 20V4m-5 5 5-5 5 5', sortdesc: 'M12 4v16m-5-5 5 5 5-5',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  clock: 'M12 7v5l3 2M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0',
  database: 'M20 6c0 2-3.6 4-8 4s-8-2-8-4 3.6-4 8-4 8 2 8 4ZM4 6v12c0 2 3.6 4 8 4s8-2 8-4V6M4 12c0 2 3.6 4 8 4s8-2 8-4',
  alert: 'M12 3 2 21h20zM12 9v5M12 17h.01', home: 'm3 10 9-7 9 7v11h-6v-7H9v7H3z'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.file}"/></svg>`;
// All imported data and user-entered text is escaped before entering HTML.
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = value => Number(value).toLocaleString('en-US');
const sizeLabel = size => size < 1024 ? `${size} B` : size < 1048576 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1048576).toFixed(1)} MB`;
const dateLabel = time => new Date(time).toLocaleDateString('en-US', {month:'short', day:'numeric'});
const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const fileInput = document.querySelector('#file-input');
const operators = {contains:'contains', not_contains:'does not contain', starts:'starts with', eq:'is', neq:'is not', gt:'is greater than', gte:'is at least', lt:'is less than', lte:'is at most', empty:'is empty', not_empty:'is not empty'};
const defaultState = () => ({query:'', filters:[], sort:null, columns:null, page:1, pageSize:8, density:'comfortable', selected:new Set()});
let datasets = [makeSample()];
let currentId = 'sample-sales';
let state = defaultState();
let savedViews = [];
let route = 'explorer';
let mobileOpen = false;
let draftFilters = [], draftColumns = [];
let db, storageWarned = false, searchTimer, importing = false;
const worker = new Worker('./worker.mjs', {type:'module'});
const workerJobs = new Map();
let workerJobId = 0;
worker.onmessage = ({data}) => {
  const job = workerJobs.get(data.id); if (!job) return;
  workerJobs.delete(data.id);
  data.error ? job.reject(new Error(data.error)) : job.resolve(data.result);
};
worker.onerror = () => {
  for (const job of workerJobs.values()) job.reject(new Error('Background processing stopped unexpectedly.'));
  workerJobs.clear();
};
const runWorker = (task, payload) => new Promise((resolve,reject) => {
  const id = ++workerJobId; workerJobs.set(id,{resolve,reject}); worker.postMessage({id,task,payload});
});
const dataset = () => datasets.find(d => d.id === currentId) || datasets[0];
const visibleColumns = () => state.columns || dataset().headers.map((_, i) => i);

// IndexedDB keeps imported files on this device. Preferences use localStorage.
async function initStorage() {
  try {
    const saved = JSON.parse(localStorage.getItem('minttable-views') || '[]');
    savedViews = Array.isArray(saved) ? saved : [];
  } catch { storageWarning(); }
  try {
    db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('minttable-workspace', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('datasets', {keyPath:'id'});
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const files = await new Promise((resolve, reject) => {
      const request = db.transaction('datasets').objectStore('datasets').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    datasets = [datasets[0], ...files.filter(d => d.id !== 'sample-sales').map(normalizeDataset).filter(Boolean)];
    savedViews = savedViews.map(view => normalizeView(view,datasets)).filter(Boolean);
    const lastId = localStorage.getItem('minttable-active');
    if (datasets.some(d => d.id === lastId)) currentId = lastId;
  } catch { storageWarning(); }
  render();
}
function storageWarning() {
  if (!storageWarned) toast('Browser storage is unavailable. Export your work before closing this tab.', true);
  storageWarned = true;
}
async function persistFile(file, remove = false) {
  if (!db) { storageWarning(); return false; }
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('datasets', 'readwrite');
      const store = tx.objectStore('datasets');
      if (remove) store.delete(file.id); else store.put(file);
      tx.oncomplete = resolve;
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
    return true;
  } catch {
    toast(remove ? 'Could not remove this file from browser storage.' : 'File is open, but could not be saved in this browser. Export it before closing.', true);
    return false;
  }
}
function persistViews() {
  try { localStorage.setItem('minttable-views', JSON.stringify(savedViews)); return true; }
  catch { storageWarning(); return false; }
}
function rememberActive() { try { localStorage.setItem('minttable-active', currentId); } catch {} }
function toast(message, error = false) {
  const el = document.createElement('div');
  el.className = `toast${error ? ' error' : ''}`;
  el.innerHTML = `${icon(error ? 'alert' : 'circlecheck')}<span>${esc(message)}</span><button aria-label="Dismiss notification">${icon('close')}</button>`;
  el.querySelector('button').onclick = () => el.remove();
  document.querySelector('#toasts').append(el);
  setTimeout(() => el.remove(), error ? 10000 : 5000);
}

// Main layout and pages.
function render() {
  const d = dataset();
  const routeName = route === 'files' ? 'My files' : route === 'views' ? 'Saved views' : 'Data explorer';
  app.innerHTML = `
    <div class="mobile-scrim ${mobileOpen ? 'visible' : ''}" data-action="toggle-menu"></div>
    <aside class="sidebar ${mobileOpen ? 'open' : ''}" aria-label="Main navigation">
      <a class="brand" href="#" data-action="explorer" aria-label="Cella home"><span class="brand-mark"><i></i><i></i><i></i><i></i></span><span>cella<span class="brand-dot">.</span></span></a>
      <button class="workspace-switch" data-action="workspace"><span class="workspace-icon">${icon('grid')}</span>Personal workspace${icon('down')}</button>
      <div class="nav-label">WORKSPACE</div>
      <nav>${[['explorer','table','Data explorer'],['files','folder','My files'],['views','bookmark','Saved views']].map(([key,glyph,label]) => `<button class="nav-item ${route === key ? 'active' : ''}" data-action="${key}" ${route === key ? 'aria-current="page"' : ''}>${icon(glyph)}${label}${key === 'files' ? `<span class="nav-count">${datasets.length}</span>` : key === 'views' && savedViews.length ? `<span class="nav-count">${savedViews.length}</span>` : ''}</button>`).join('')}</nav>
      <div class="recent-section"><div class="nav-label">RECENT FILES</div>${[...datasets].sort((a,b) => b.imported-a.imported).slice(0,4).map(file => `<button class="nav-item recent-file ${file.id === d.id ? 'active' : ''}" data-action="open-file" data-id="${esc(file.id)}" title="${esc(file.name)}">${icon('file')}<span>${esc(file.name)}</span></button>`).join('')}</div>
      <div class="sidebar-bottom"><div class="guide-card">${icon('leaf')}<h3>A little less spreadsheet.<br>A little more perspective.</h3><p>Simple tools. Clearer data.<br>Room to focus on what matters.</p><button data-action="guide">Take a quick tour ${icon('arrowup')}</button></div><div class="local-badge">${icon('shield')}Your data stays with you</div></div>
    </aside>
    <div class="main-shell"><header class="topbar"><button class="mobile-menu" data-action="toggle-menu" aria-label="Open navigation" aria-expanded="${mobileOpen}">${icon('menu')}</button><div class="breadcrumbs">${icon('home')}<span>Workspace</span><span class="separator">/</span><span class="current">${routeName}</span></div><div class="topbar-right"><span class="privacy-status"><i class="green-dot"></i>Private by default</span><button class="help-button" data-action="guide">${icon('help')}How it works</button><button class="avatar" data-action="workspace" aria-label="Personal workspace details">C</button></div></header>
    <main class="page" id="main">${route === 'files' ? filesPage() : route === 'views' ? viewsPage() : explorerPage()}</main></div>`;
  if (route === 'explorer') renderTable();
}
function uploadZone() {
  return `<section class="upload-zone" aria-label="Import a CSV file"><div class="file-art" aria-hidden="true"><span class="back"></span><span class="front"><b>CSV</b><span class="mini-grid"></span></span><span class="plus">+</span></div><div class="upload-copy"><h2>Good things start with a CSV.</h2><p>Drop your file here. We’ll take care of the rows and columns.</p><p class="file-hint">CSV & TSV files · Up to 15 MB each · Always private</p></div><div class="upload-actions"><button class="btn btn-primary" data-action="upload">${icon('upload')}Upload a file</button><button class="text-btn sample-btn" data-action="sample">or <span>try a sample file</span> ${icon('arrow')}</button></div></section>`;
}
function footer() {
  return `<footer class="workspace-footer"><span>${icon('lock')}Your files are processed in your browser. Nothing leaves your device.</span><span>Made for a clearer view ${icon('spark')}</span></footer>`;
}
function statCard(label, value, unit, glyph, caption, check = false) {
  return `<div class="stat-card"><div class="stat-label">${label}</div><span class="stat-icon">${icon(glyph)}</span><div class="stat-value">${value}${unit ? `<small>${unit}</small>` : ''}</div><div class="stat-caption">${check ? icon('check') : ''}${caption}</div></div>`;
}
function explorerPage() {
  const d = dataset();
  return `<div class="explorer-toolbar"><div class="file-title-group"><span class="file-icon">${icon('file')}</span><div><div class="file-title" title="${esc(d.name)}">${esc(d.name)}</div><p class="file-subtitle">${fmt(d.rows.length)} rows · ${d.headers.length} columns</p></div>${d.sample ? '<span class="sample-tag">Sample</span>' : ''}</div><div class="data-actions"><button class="btn" data-action="upload">${icon('upload')}Open CSV</button><button class="btn" data-action="save-view">${icon('bookmark')}Save view</button><button class="btn export-btn" data-action="export">${icon('download')}Export${icon('down')}</button></div></div>
    <section aria-label="Explore your data">
    <div class="table-panel"><div class="table-tabs"><div class="table-tab">${icon('table')}Table view<span>${fmt(d.rows.length)}</span></div><button class="text-btn" data-action="clean">${icon('spark')}Tidy up data</button></div>
    <div class="table-toolbar"><div class="search-field">${icon('search')}<input type="search" id="table-search" placeholder="Search anything in your data…" aria-label="Search all data" value="${esc(state.query)}" autocomplete="off"><kbd>/</kbd></div><div class="toolbar-actions"><button class="btn ${state.filters.length ? 'active' : ''}" data-action="filter">${icon('filter')}Filters${state.filters.length ? `<span class="filter-count">${state.filters.length}</span>` : ''}</button><button class="btn ${state.sort ? 'active' : ''}" data-action="sort-options">${icon('sort')}Sort${state.sort ? `: ${esc(dataset().headers[state.sort.column])} ${state.sort.direction === 'asc' ? '↑' : '↓'}` : ''}</button><button class="btn" data-action="columns">${icon('columns')}Columns${icon('down')}</button><div class="density-group" aria-label="Table density">${['comfortable','compact'].map(mode => `<button class="icon-btn ${state.density === mode ? 'selected' : ''}" data-action="density" data-value="${mode}" aria-label="${mode === 'compact' ? 'Compact' : 'Comfortable'} rows" aria-pressed="${state.density === mode}" title="${mode} rows">${icon(mode === 'compact' ? 'compact' : 'menu')}</button>`).join('')}</div></div></div>
    <div id="filter-chips"></div><div id="table-content"></div></div></section>`;
}
function renderCell(value, column, index) {
  const d = dataset(), name = d.headers[column];
  if (value === '') return '<span class="muted" aria-label="Empty cell">—</span>';
  if (/^(customer|name|full name|employee|client)$/i.test(name)) {
    const initials = value.trim().split(/\s+/).slice(0,2).map(w => w[0]).join('').toUpperCase();
    return `<span class="customer-cell"><span class="customer-avatar tone-${index % 6}">${esc(initials)}</span>${esc(value)}</span>`;
  }
  if (/^(status|state)$/i.test(name)) {
    const status = value.toLowerCase().trim();
    const tone = /pending|waiting|draft/.test(status) ? 'pending' : /processing|progress|shipped/.test(status) ? 'processing' : /cancel|fail|inactive/.test(status) ? 'cancelled' : '';
    return `<span class="status-tag ${tone}">${esc(value)}</span>`;
  }
  if (/^(category|department|type)$/i.test(name)) return `<span class="category-tag">${esc(value)}</span>`;
  if (d.sample && name === 'Amount') return `$${toNumber(value).toFixed(2)}`;
  if (d.types[column] === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(value+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
  return esc(value);
}
function filterLabel(f) {
  const type = dataset().types[f.column];
  const operator = type === 'date' && f.operator === 'gt' ? 'is after' : type === 'date' && f.operator === 'lt' ? 'is before' : operators[f.operator];
  return `${esc(dataset().headers[f.column])} ${operator}${['empty','not_empty'].includes(f.operator) ? '' : ` “${esc(f.value)}”`}`;
}
function pageButtons(pages) {
  const numbers = [...new Set([1,state.page-1,state.page,state.page+1,pages].filter(n => n >= 1 && n <= pages))].sort((a,b) => a-b);
  let previous = 0;
  return numbers.map(n => {
    const gap = n - previous > 1 ? '<span aria-hidden="true">…</span>' : ''; previous = n;
    return `${gap}<button data-action="page" data-page="${n}" class="${n === state.page ? 'current' : ''}" ${n === state.page ? 'aria-current="page"' : ''} aria-label="Page ${n}">${n}</button>`;
  }).join('');
}
function renderTable() {
  const target = document.querySelector('#table-content'); if (!target) return;
  const d = dataset(), rows = queryRows(d,state), columns = visibleColumns();
  const pages = Math.max(1,Math.ceil(rows.length/state.pageSize)); state.page = Math.min(state.page,pages);
  const start = (state.page-1)*state.pageSize, pageRows = rows.slice(start,start+state.pageSize);
  const allSelected = pageRows.length > 0 && pageRows.every(r => state.selected.has(r.index));
  document.querySelector('#filter-chips').innerHTML = state.filters.length ? `<div class="filter-chips">${state.filters.map((f,i) => `<span class="filter-chip">${filterLabel(f)}<button data-action="remove-filter" data-index="${i}" aria-label="Remove filter ${i+1}">${icon('close')}</button></span>`).join('')}<button class="clear-filter" data-action="clear-filters">Clear all</button></div>` : '';
  target.innerHTML = `${rows.length ? `<div class="table-scroller" tabindex="0" aria-label="Data table, scroll horizontally to see more columns"><table class="data-table ${state.density === 'compact' ? 'compact' : ''}"><thead><tr><th class="check-cell"><input type="checkbox" id="select-page" aria-label="Select all rows on this page" ${allSelected ? 'checked' : ''}></th><th class="row-number" scope="col">#</th>${columns.map(c => `<th scope="col"><button data-action="sort" data-column="${c}" title="Sort by ${esc(d.headers[c])}">${esc(d.headers[c])}</button></th>`).join('')}</tr></thead><tbody>${pageRows.map((row,i) => `<tr class="${state.selected.has(row.index) ? 'row-selected' : ''}"><td class="check-cell"><input type="checkbox" data-row="${row.index}" aria-label="Select row ${start+i+1}" ${state.selected.has(row.index) ? 'checked' : ''}></td><td class="row-number">${start+i+1}</td>${columns.map(c => `<td class="${d.types[c] === 'number' ? 'amount-cell' : /order id/i.test(d.headers[c]) ? 'order-cell' : ''}" title="${esc(row.values[c])}">${renderCell(row.values[c],c,row.index)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : `<div class="empty-results">${icon('search')}<h3>${d.rows.length ? 'A fresh start for your search.' : 'Just the headers, for now.'}</h3><p>${d.rows.length ? 'No rows match this view. Try a broader search or clear your filters.' : 'This file has column headers but no data rows.'}</p><button class="btn" data-action="${d.rows.length ? 'reset' : 'upload'}">${d.rows.length ? 'Clear search & filters' : 'Upload another file'}</button></div>`}
    <div class="table-footer"><div>${state.selected.size ? `<span class="selected-summary"><strong>${fmt(state.selected.size)} selected</strong><button data-action="clear-selection">Clear selection</button></span>` : `Showing <strong>${rows.length ? start+1 : 0}–${Math.min(start+state.pageSize,rows.length)}</strong> of <strong>${fmt(rows.length)}</strong> rows${rows.length !== d.rows.length ? ` <span class="muted">(${fmt(d.rows.length)} total)</span>` : ''}`}</div><label class="page-size">Rows per page<select id="page-size" aria-label="Rows per page">${[8,15,25,50,100,500].map(n => `<option ${state.pageSize === n ? 'selected' : ''} value="${n}">${n}</option>`).join('')}</select></label><div class="pagination" aria-label="Pagination"><button data-action="page" data-page="${state.page-1}" aria-label="Previous page" ${state.page <= 1 ? 'disabled' : ''}>${icon('left')}</button>${pageButtons(pages)}<button data-action="page" data-page="${state.page+1}" aria-label="Next page" ${state.page >= pages ? 'disabled' : ''}>${icon('chevron')}</button></div></div>`;
  const check = document.querySelector('#select-page');
  if (check) check.indeterminate = !allSelected && pageRows.some(r => state.selected.has(r.index));
}
function filesPage() {
  return `<div class="page-heading"><div><div class="eyebrow">${icon('folder')}YOUR WORKSPACE</div><h1>A home for your data.</h1><p>All your files, right where you left them.</p></div></div>${uploadZone()}<div class="collection-grid">${[...datasets].sort((a,b) => b.imported-a.imported).map(d => `<article class="collection-card"><div class="collection-card-top"><span class="file-icon">${icon('file')}</span>${d.sample ? '<span class="sample-tag">Sample data</span>' : `<button class="icon-btn danger-icon" data-action="delete-file" data-id="${esc(d.id)}" aria-label="Remove ${esc(d.name)}">${icon('trash')}</button>`}</div><h3 title="${esc(d.name)}">${esc(d.name)}</h3><p>${fmt(d.rows.length)} rows · ${d.headers.length} columns · ${sizeLabel(d.size)}</p><div class="collection-card-bottom"><span>${d.sample ? 'A little inspiration' : dateLabel(d.imported)}</span><button class="btn" data-action="open-file" data-id="${esc(d.id)}">Explore ${icon('arrow')}</button></div></article>`).join('')}</div>${footer()}`;
}
function viewsPage() {
  return `<div class="page-heading"><div><div class="eyebrow">${icon('bookmark')}PICK UP WHERE YOU LEFT OFF</div><h1>Your favorite perspectives.</h1><p>Keep useful filters and column layouts just a click away.</p></div></div>${savedViews.length ? `<div class="collection-grid">${savedViews.map(v => {
    const d = datasets.find(d => d.id === v.datasetId);
    return `<article class="collection-card"><div class="collection-card-top"><span class="file-icon">${icon('bookmark')}</span><button class="icon-btn danger-icon" data-action="delete-view" data-id="${esc(v.id)}" aria-label="Remove saved view ${esc(v.name)}">${icon('trash')}</button></div><h3 title="${esc(v.name)}">${esc(v.name)}</h3><p>${esc(d?.name || 'File no longer available')}<br>${v.filters.length} filters · ${v.columns?.length || d?.headers.length || 0} columns${v.query ? ' · Search applied' : ''}</p><div class="collection-card-bottom"><span>${dateLabel(v.created)}</span><button class="btn" data-action="load-view" data-id="${esc(v.id)}" ${d ? '' : 'disabled'}>Open view ${icon('arrow')}</button></div></article>`;
  }).join('')}</div>` : `<div class="collection-empty empty-results">${icon('bookmark')}<h3>Good views are worth keeping.</h3><p>Apply filters, choose your columns, then select “Save view”<br>in the explorer to keep that perspective.</p><button class="btn btn-primary" data-action="explorer">Explore your data ${icon('arrow')}</button></div>`}${footer()}`;
}

// Accessible native dialogs for editing a view.
function openModal(title, subtitle, body, actions = '') {
  modal.innerHTML = `<div class="modal-header"><div><h2 id="modal-title">${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div><button class="icon-btn" data-action="close-modal" aria-label="Close dialog">${icon('close')}</button></div><div class="modal-body">${body}</div>${actions ? `<div class="modal-footer">${actions}</div>` : ''}`;
  if (!modal.open) modal.showModal();
}
const cancelButton = () => '<button class="btn" data-action="close-modal">Cancel</button>';
function showError(id, message) { document.querySelector(id).innerHTML = `<div class="error-box">${esc(message)}</div>`; }
function openFilters() {
  draftFilters = state.filters.length ? structuredClone(state.filters) : [{column:0,operator:'contains',value:''}];
  openModal('Find what matters.','Show rows that match all of your conditions.','<div id="draft-filters"></div><button class="add-condition" data-action="add-filter">'+icon('plus')+'Add a condition</button><div id="filter-error" role="alert"></div>',`<button class="text-btn" data-action="reset-draft-filters">Reset filters</button>${cancelButton()}<button class="btn btn-primary" data-action="apply-filters">Apply filters</button>`);
  renderDraftFilters();
}
function renderDraftFilters() {
  const d = dataset();
  document.querySelector('#draft-filters').innerHTML = draftFilters.length ? draftFilters.map((f,i) => {
    const type = d.types[f.column];
    const ops = type === 'text' ? ['contains','not_contains','eq','neq','starts','empty','not_empty'] : ['eq','neq','gt','gte','lt','lte','empty','not_empty'];
    if (!ops.includes(f.operator)) f.operator = ops[0];
    return `<div class="condition-label">${i ? 'And' : 'Where'}</div><div class="filter-row"><select data-filter-field="column" data-index="${i}" aria-label="Column for condition ${i+1}">${d.headers.map((h,c) => `<option value="${c}" ${f.column === c ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select><select data-filter-field="operator" data-index="${i}" aria-label="Operator for condition ${i+1}">${ops.map(o => `<option value="${o}" ${f.operator === o ? 'selected' : ''}>${type === 'date' && o === 'gt' ? 'is after' : type === 'date' && o === 'lt' ? 'is before' : operators[o]}</option>`).join('')}</select><input data-filter-field="value" data-index="${i}" aria-label="Value for condition ${i+1}" placeholder="${type === 'number' ? 'e.g. 50' : 'Enter a value'}" type="${type === 'date' ? 'date' : type === 'number' ? 'number' : 'text'}" ${type === 'number' ? 'step="any"' : ''} value="${esc(f.value)}" ${['empty','not_empty'].includes(f.operator) ? 'disabled' : ''}><button class="icon-btn" data-action="remove-draft-filter" data-index="${i}" aria-label="Remove condition ${i+1}">${icon('close')}</button></div>`;
  }).join('') : '<p class="muted">No conditions. All rows will be shown.</p>';
}
function applyFilters() {
  const invalid = draftFilters.some(f => !['empty','not_empty'].includes(f.operator) && (!String(f.value).trim() || (dataset().types[f.column] === 'number' && !Number.isFinite(toNumber(f.value))) || (dataset().types[f.column] === 'date' && Number.isNaN(Date.parse(f.value)))));
  if (invalid) { showError('#filter-error','Add a valid value for every condition, or remove the unused condition.'); return; }
  state.filters = structuredClone(draftFilters); state.page = 1; state.selected.clear(); modal.close(); render();
  toast(`${fmt(queryRows(dataset(),state).length)} rows match your view.`);
}
function openColumns() {
  draftColumns = [...visibleColumns()];
  openModal('A clearer view.','Choose the columns you want to see. Your original data stays intact.',`<div>${dataset().headers.map((h,i) => `<label class="column-item"><input type="checkbox" data-column-choice="${i}" ${draftColumns.includes(i) ? 'checked' : ''}>${esc(h)}<span class="column-type">${dataset().types[i]}</span></label>`).join('')}</div><div id="column-error" role="alert"></div>`,`<button class="text-btn" data-action="show-all-columns">Show all columns</button>${cancelButton()}<button class="btn btn-primary" data-action="apply-columns">Apply columns</button>`);
}
function openSortOptions() {
  const d = dataset();
  const column = state.sort?.column ?? 0;
  const direction = state.sort?.direction ?? 'asc';
  openModal('Sort rows','Choose a column and sort direction.',`<label class="dialog-field">Column<select id="sort-column">${d.headers.map((header,index) => `<option value="${index}" ${column === index ? 'selected' : ''}>${esc(header)}</option>`).join('')}</select></label><label class="dialog-field">Direction<select id="sort-direction"><option value="asc" ${direction === 'asc' ? 'selected' : ''}>Ascending (A–Z, lowest first)</option><option value="desc" ${direction === 'desc' ? 'selected' : ''}>Descending (Z–A, highest first)</option></select></label>`,`${state.sort ? '<button class="text-btn" data-action="clear-sort">Clear sort</button>' : ''}${cancelButton()}<button class="btn btn-primary" data-action="apply-sort">Apply sort</button>`);
}
function openSaveView() {
  openModal('Keep this perspective.','Save your filters, search, sort order, and visible columns.',`<label class="dialog-field">View name<input id="view-name" placeholder="e.g. Completed orders over $50" maxlength="80"></label><div class="info-box">${esc(dataset().name)}<br>${fmt(queryRows(dataset(),state).length)} matching rows · ${state.filters.length} filters · ${visibleColumns().length} visible columns</div><div id="view-error" role="alert"></div>`,`${cancelButton()}<button class="btn btn-primary" data-action="confirm-save-view">${icon('bookmark')}Save view</button>`);
  document.querySelector('#view-name').focus();
}
function openExport() {
  const d = dataset(), count = queryRows(d,state).length;
  openModal('Take your clarity with you.','Download a CSV with exactly the data you need.',`<label class="dialog-field">File name<input id="export-name" value="${esc(d.name.replace(/\.(csv|tsv)$/i,'')+'-export.csv')}" maxlength="150"></label><label class="dialog-field">Rows to export<select id="export-rows"><option value="filtered">Current view (${fmt(count)} rows)</option><option value="all">All data (${fmt(d.rows.length)} rows)</option>${state.selected.size ? `<option value="selected">Selected rows (${fmt(state.selected.size)} rows)</option>` : ''}</select></label><label class="dialog-field">Columns to export<select id="export-columns"><option value="visible">Visible columns (${visibleColumns().length})</option><option value="all">All columns (${d.headers.length})</option></select></label><label class="check-option"><input type="checkbox" id="safe-export" checked><span>Make safe for spreadsheet apps<small>Prefix formula-like cells with an apostrophe so spreadsheets open them as text.</small></span></label><div id="export-error" role="alert"></div>`,`${cancelButton()}<button class="btn btn-primary" data-action="confirm-export">${icon('download')}Download CSV</button>`);
}
function doExport() {
  const d = dataset(), mode = document.querySelector('#export-rows').value;
  const rows = mode === 'all' ? d.rows : mode === 'selected' ? d.rows.filter((_,i) => state.selected.has(i)) : queryRows(d,state).map(r => r.values);
  const columns = document.querySelector('#export-columns').value === 'all' ? d.headers.map((_,i) => i) : visibleColumns();
  let name = document.querySelector('#export-name').value.trim().replace(/[\\/:*?"<>|]/g,'-');
  if (!name) { showError('#export-error','Give your export a file name.'); return; }
  if (!name.toLowerCase().endsWith('.csv')) name += '.csv';
  const csv = serializeCSV(columns.map(c => d.headers[c]),rows.map(row => columns.map(c => row[c])),document.querySelector('#safe-export').checked);
  const url = URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'}));
  const link = document.createElement('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url),30000); modal.close(); toast(`${fmt(rows.length)} rows exported. A little clarity, to go.`);
}
const cleanOptions = () => ({trim:document.querySelector('#clean-trim').checked,duplicates:document.querySelector('#clean-duplicates').checked,empty:false});
function openClean() {
  openModal('A small tidy-up. A fresh start.','Create a cleaned copy and keep your original file.',[
    ['trim','Trim extra spaces','Remove spaces from the beginning and end of each cell.'],
    ['duplicates','Remove duplicate rows','Keep the first occurrence of rows with identical values.']
  ].map(([key,title,description]) => `<label class="check-option"><input type="checkbox" id="clean-${key}" checked><span>${title}<small>${description}</small></span></label>`).join('')+'<div class="info-box" id="clean-preview"></div>',`${cancelButton()}<button class="btn btn-primary" data-action="confirm-clean">${icon('spark')}Create clean copy</button>`);
  updateCleanPreview();
}
async function updateCleanPreview() {
  const preview = document.querySelector('#clean-preview');
  const current = dataset(), options = cleanOptions();
  preview.textContent = 'Calculating preview…';
  try {
    const cleaned = await runWorker('clean',{headers:current.headers,rows:current.rows,options});
    if (!preview.isConnected || current !== dataset()) return;
    const trimmed = options.trim ? current.rows.reduce((n,row) => n+row.filter(v => v !== v.trim()).length,0) : 0;
    preview.textContent = `Preview: ${fmt(current.rows.length-cleaned.rows.length)} rows removed · ${fmt(trimmed)} cells trimmed · ${fmt(cleaned.rows.length)} rows in your clean copy.`;
  } catch (error) {
    if (preview.isConnected) preview.textContent = error.message;
  }
}
function guide() {
  const steps = [
    ['1','Drop in your data','Upload a CSV or TSV file, or drag it anywhere onto the page. The first row becomes the column headers. Use the sample file to explore first.'],
    ['2','Find your focus','Search every column. Combine filters, click a column header to cycle through ascending, descending, and original order, and hide columns you don’t need.'],
    ['3','Make it yours','Tidy extra spaces and duplicates in a fresh copy. Save useful views to pick up where you left off.'],
    ['4','Take it with you','Export the current view, selected rows, or the full dataset. Files stay in this browser and are never uploaded.']
  ];
  openModal('A little tour of Cella.','From a busy spreadsheet to a clearer perspective.',steps.map(([n,title,body]) => `<div class="guide-step"><span>${n}</span><div><h3>${title}</h3><p>${body}</p></div></div>`).join(''),`<button class="btn btn-primary" data-action="close-modal">Got it. Let’s explore ${icon('arrow')}</button>`);
}
function openWorkspace() {
  openModal('Your personal workspace.','A quiet place to make sense of your data.',`<div class="info-box">${datasets.length} files · ${savedViews.length} saved views<br>Stored on this device, in this browser.</div><div class="guide-step" style="margin-top:23px"><span>${icon('shield')}</span><div><h3>Private by design</h3><p>Your CSV data is processed on your device. Nothing is sent to a server. Files stay available when you return to this browser at the same address.</p></div></div><div class="guide-step"><span>${icon('download')}</span><div><h3>Keep a copy of what matters</h3><p>Clearing browser data removes this workspace. Export important files to keep a separate copy. A different browser or local port has its own workspace.</p></div></div>`,'<button class="btn btn-primary" data-action="close-modal">Back to workspace</button>');
}

// File ingestion and navigation.
function openFile(id) {
  if (!datasets.some(d => d.id === id)) return;
  currentId = id; state = defaultState(); route = 'explorer'; mobileOpen = false; rememberActive(); render();
  window.scrollTo({top:0,behavior:'smooth'});
}
async function importFiles(files) {
  if (importing) return;
  importing = true;
  let count = 0, lastId;
  try {
    await storageReady;
    for (const file of files) {
      if (!/\.(csv|tsv)$/i.test(file.name)) { toast(`${file.name}: choose a .csv or .tsv file.`,true); continue; }
      if (file.size > 15*1024*1024) { toast(`${file.name}: the 15 MB file limit was exceeded.`,true); continue; }
      try {
        const parsed = await runWorker('import',{text:await file.text()});
        if (parsed.headers.length > 250) throw new Error('This file has more than 250 columns. Split it into smaller files.');
        if (parsed.rows.length > 200000) throw new Error('This file has more than 200,000 rows. Split it into smaller files.');
        const fileData = {id:crypto.randomUUID(),name:file.name,headers:parsed.headers,rows:parsed.rows,types:parsed.types,size:file.size,imported:Date.now(),sample:false};
        datasets.push(fileData); await persistFile(fileData); lastId = fileData.id; count++;
        if (parsed.padded) toast(`${fmt(parsed.padded)} short rows were filled with empty cells.`);
      } catch (error) { toast(`${file.name}: ${error.message}`,true); }
    }
    if (lastId) { openFile(lastId); toast(`${count === 1 ? 'Your file is' : `${count} files are`} ready. A fresh perspective awaits.`); }
  } finally { fileInput.value = ''; importing = false; }
}

// Event delegation keeps every dynamically rendered control connected.
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]'); if (!button || button.disabled) return;
  const action = button.dataset.action;
  if (button.tagName === 'A') event.preventDefault();
  if (['explorer','files','views'].includes(action)) { route = action; mobileOpen = false; render(); return; }
  switch (action) {
    case 'toggle-menu': mobileOpen = !mobileOpen; render(); break;
    case 'upload': fileInput.click(); break;
    case 'sample': openFile('sample-sales'); toast('Sample loaded. Go ahead, make yourself at home.'); break;
    case 'open-file': openFile(button.dataset.id); break;
    case 'guide': guide(); break;
    case 'workspace': openWorkspace(); break;
    case 'close-modal': modal.close(); break;
    case 'filter': openFilters(); break;
    case 'sort-options': openSortOptions(); break;
    case 'apply-sort':
      state.sort = {column:Number(document.querySelector('#sort-column').value),direction:document.querySelector('#sort-direction').value};
      state.page = 1; modal.close(); render(); break;
    case 'clear-sort': state.sort = null; state.page = 1; modal.close(); render(); break;
    case 'columns': openColumns(); break;
    case 'save-view': openSaveView(); break;
    case 'export': openExport(); break;
    case 'clean': openClean(); break;
    case 'page': state.page = Number(button.dataset.page); renderTable(); break;
    case 'sort': {
      const column = Number(button.dataset.column);
      state.sort = state.sort?.column === column ? (state.sort.direction === 'asc' ? {column,direction:'desc'} : null) : {column,direction:'asc'};
      state.page = 1; renderTable(); break;
    }
    case 'density': state.density = button.dataset.value; render(); break;
    case 'reset': state.query = ''; state.filters = []; state.page = 1; state.selected.clear(); render(); break;
    case 'clear-filters': state.filters = []; state.page = 1; state.selected.clear(); render(); break;
    case 'remove-filter': state.filters.splice(Number(button.dataset.index),1); state.page = 1; state.selected.clear(); render(); break;
    case 'clear-selection': state.selected.clear(); renderTable(); break;
    case 'add-filter': draftFilters.push({column:0,operator:'contains',value:''}); renderDraftFilters(); break;
    case 'remove-draft-filter': draftFilters.splice(Number(button.dataset.index),1); renderDraftFilters(); break;
    case 'reset-draft-filters': draftFilters = []; renderDraftFilters(); break;
    case 'apply-filters': applyFilters(); break;
    case 'show-all-columns': draftColumns = dataset().headers.map((_,i) => i); modal.querySelectorAll('[data-column-choice]').forEach(input => input.checked = true); break;
    case 'apply-columns':
      if (!draftColumns.length) { showError('#column-error','Keep at least one column visible.'); break; }
      state.columns = draftColumns.sort((a,b) => a-b); modal.close(); renderTable(); break;
    case 'confirm-save-view': {
      const name = document.querySelector('#view-name').value.trim();
      if (!name) { showError('#view-error','Give this view a name so you can find it later.'); break; }
      savedViews.push({id:crypto.randomUUID(),name,datasetId:currentId,query:state.query,filters:structuredClone(state.filters),sort:state.sort ? {...state.sort} : null,columns:[...visibleColumns()],pageSize:state.pageSize,density:state.density,created:Date.now()});
      const saved = persistViews(); modal.close(); render();
      toast(saved ? 'View saved. Find it under Saved views.' : 'View kept for this session only.'); break;
    }
    case 'load-view': {
      const v = savedViews.find(v => v.id === button.dataset.id);
      if (!v || !datasets.some(d => d.id === v.datasetId)) break;
      currentId = v.datasetId;
      state = {...defaultState(),query:v.query,filters:structuredClone(v.filters),sort:v.sort ? {...v.sort} : null,columns:[...v.columns],pageSize:v.pageSize,density:v.density};
      route = 'explorer'; rememberActive(); render(); toast(`Opened “${v.name}”.`); break;
    }
    case 'delete-view':
      savedViews = savedViews.filter(v => v.id !== button.dataset.id); persistViews(); render(); toast('Saved view removed. Your data is unchanged.'); break;
    case 'confirm-export': doExport(); break;
    case 'confirm-clean': {
      button.disabled = true;
      const original = dataset(), cleaned = await runWorker('clean',{headers:original.headers,rows:original.rows,options:cleanOptions()});
      const copy = {...original,id:crypto.randomUUID(),name:original.name.replace(/\.(csv|tsv)$/i,'')+'-cleaned.csv',rows:cleaned.rows,types:cleaned.types,size:cleaned.size,imported:Date.now(),sample:false};
      datasets.push(copy); await persistFile(copy); modal.close(); openFile(copy.id); toast('A fresh copy is ready. Your original is safely kept.'); break;
    }
    case 'delete-file': {
      const d = datasets.find(d => d.id === button.dataset.id); if (!d || d.sample) break;
      openModal('Remove this file?','This removes the file and its saved views from this browser.',`<div class="info-box">${esc(d.name)}<br>${fmt(d.rows.length)} rows · ${d.headers.length} columns</div>`,`${cancelButton()}<button class="btn btn-primary" data-action="confirm-delete-file" data-id="${esc(d.id)}">Remove file</button>`); break;
    }
    case 'confirm-delete-file': {
      const d = datasets.find(d => d.id === button.dataset.id); if (!d || d.sample) break;
      button.disabled = true;
      if (db && !await persistFile(d,true)) { button.disabled = false; break; }
      datasets = datasets.filter(item => item.id !== d.id); savedViews = savedViews.filter(v => v.datasetId !== d.id); persistViews();
      if (currentId === d.id) { currentId = 'sample-sales'; state = defaultState(); rememberActive(); }
      modal.close(); render(); toast('File removed from this workspace.'); break;
    }
  }
});
document.addEventListener('input', event => {
  const input = event.target;
  if (input.id === 'table-search') {
    state.query = input.value; state.page = 1; state.selected.clear();
    clearTimeout(searchTimer); searchTimer = setTimeout(renderTable,80);
  }
  if (input.dataset.filterField === 'value') draftFilters[Number(input.dataset.index)].value = input.value;
});
document.addEventListener('change', event => {
  const input = event.target;
  if (input.id === 'page-size') { state.pageSize = Number(input.value); state.page = 1; renderTable(); }
  if (input.id === 'select-page') {
    queryRows(dataset(),state).slice((state.page-1)*state.pageSize,state.page*state.pageSize).forEach(row => input.checked ? state.selected.add(row.index) : state.selected.delete(row.index)); renderTable();
  }
  if (input.dataset.row !== undefined) { const n = Number(input.dataset.row); input.checked ? state.selected.add(n) : state.selected.delete(n); renderTable(); }
  if (input.dataset.filterField) {
    const index = Number(input.dataset.index), field = input.dataset.filterField;
    draftFilters[index][field] = field === 'column' ? Number(input.value) : input.value;
    if (field === 'column') { draftFilters[index].value = ''; draftFilters[index].operator = dataset().types[Number(input.value)] === 'text' ? 'contains' : 'eq'; }
    if (field !== 'value') renderDraftFilters();
  }
  if (input.dataset.columnChoice !== undefined) { const n = Number(input.dataset.columnChoice); draftColumns = input.checked ? [...draftColumns,n] : draftColumns.filter(c => c !== n); }
  if (input.id.startsWith('clean-')) updateCleanPreview();
});
fileInput.addEventListener('change', () => importFiles(Array.from(fileInput.files)));
let dragDepth = 0;
document.addEventListener('dragenter', event => {
  if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); dragDepth++; document.querySelector('#drop-overlay').hidden = false; }
});
document.addEventListener('dragover', event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } });
document.addEventListener('dragleave', event => {
  if (event.dataTransfer.types.includes('Files')) { dragDepth--; if (dragDepth <= 0) document.querySelector('#drop-overlay').hidden = true; }
});
document.addEventListener('drop', event => {
  if (event.dataTransfer.files.length) { event.preventDefault(); dragDepth = 0; document.querySelector('#drop-overlay').hidden = true; importFiles(Array.from(event.dataTransfer.files)); }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { document.querySelector('#drop-overlay').hidden = true; dragDepth = 0; if (mobileOpen) { mobileOpen = false; render(); } }
  if (event.key === '/' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName) && !modal.open) {
    const search = document.querySelector('#table-search'); if (search) { event.preventDefault(); search.focus(); }
  }
  if (event.key === 'Enter' && document.activeElement.id === 'view-name') modal.querySelector('[data-action="confirm-save-view"]').click();
});
modal.addEventListener('click', event => {
  if (event.target === modal) { const r = modal.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) modal.close(); }
});
render();
const storageReady = initStorage();
