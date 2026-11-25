# Cella — CSV workspace

A cream-and-mint platform for viewing CSV data in readable tables, applying filters, cleaning data, and exporting the result.

## Run in VS Code

Prerequisites: VS Code and Node.js 20 or newer. Check Node with `node --version` in your terminal.

1. Extract the ZIP.
2. In VS Code, select **File → Open Folder** and open the project folder containing `package.json`.
3. Select **Terminal → New Terminal**.
4. Run:

   ```bash
   npm start
   ```

5. Open **http://127.0.0.1:3020** in your browser.

There are **no external packages to install**, no API keys, and no database to configure. You can also run `node server.mjs` directly. Do not open `index.html` by double-clicking: JavaScript modules need the local HTTP server.

Stop the server with **Ctrl+C**. After editing HTML, CSS, or JavaScript, save and refresh the browser.

### Start using VS Code's debugger

Press **F5** and choose **Run Cella**. The included `.vscode/launch.json` starts the server and opens the local address in your browser.

### Windows PowerShell troubleshooting

If PowerShell says `npm.ps1 cannot be loaded`, use:

```powershell
npm.cmd start
```

Or avoid npm entirely:

```powershell
node server.mjs
```

If port 3020 is already in use:

```bash
node server.mjs 3021
```

Then open http://127.0.0.1:3021. Keep using the same address and port to return to the same browser workspace.

## Features

- Upload one or several CSV / TSV files, or drag and drop them onto the page.
- Built-in sample dataset with 248 fictional sales orders.
- File summaries: row count, column count, completeness, and file size.
- Search every column with one search box.
- Combine filters with AND conditions, including text, number, date, and empty-cell rules.
- Sort a column ascending, descending, or back to original order.
- Choose visible columns and comfortable or compact rows.
- Paginate and select rows across pages.
- Save named views with search, filters, sort order, column selection, and row density.
- Preview cleanup and create a new copy with trimmed cells and duplicate rows removed.
- Export current, all, or selected rows with visible or all columns.
- Optional spreadsheet formula protection during export.
- Store files in this browser with IndexedDB; store view preferences with localStorage.
- Responsive layout, native keyboard-accessible dialogs, and reduced-motion support.
- No external fonts, CDNs, analytics, or network requests from the application. Works offline after starting the local server.

## Files to edit

| File | Purpose |
| --- | --- |
| `public/index.html` | HTML shell and accessibility landmarks |
| `public/style.css` | Cream/mint theme, layout, tables, dialogs, and responsive rules |
| `public/app.mjs` | Interface, events, uploads, IndexedDB, saved views, and downloads |
| `public/data.mjs` | CSV parsing, type inference, filters, sorting, cleanup, and export |
| `public/storage.mjs` | Validation and normalization for browser-persisted data |
| `public/tasks.mjs` | Testable operations dispatched to the background worker |
| `public/worker.mjs` | Background parsing, type inference, cleanup, and serialization |
| `server.mjs` | Local static server; it does not receive CSV data |
| `tests/data.test.mjs` | CSV and data-processing tests |
| `tests/server.test.mjs` | Local server smoke test and file-access checks |
| `examples/sales_overview.csv` | Example file to upload |
| `examples/cleanup_demo.csv` | Example with whitespace, a duplicate row, an empty cell, and a multiline cell |

Although the extension is `.mjs`, these are ordinary JavaScript ES modules. The implementation uses HTML, CSS, and vanilla JavaScript. It does not require React, Django, or a build step.

## CSV behavior and limits

- The first nonempty record is treated as column headers.
- Comma, semicolon, and tab separators are detected from the header.
- UTF-8 and UTF-8 BOM are supported, including CRLF, quoted separators, escaped quotes, and multiline cells.
- Duplicate or blank headers receive unique names. Empty records are skipped during import.
- Short rows are padded with empty values and reported. Rows with extra values, invalid quotes, or unclosed quotes are rejected instead of silently losing data.
- Maximums per file: **15 MB**, **200,000 rows**, and **250 columns**. Import and cleanup processing run in a background worker; search and sorting performance still depends on the number and length of cells and your device.
- Data types are inferred. ID/phone/ZIP/code columns and values with leading zeros stay as text. ISO `YYYY-MM-DD` dates and ISO timestamps receive date comparisons; other date formats stay as text.
- Multiple filters use AND. Clear filters or remove individual condition chips to widen the view.
- Display formatting does not alter stored values. Export includes raw cell values, except when the optional spreadsheet-protection setting adds a leading apostrophe to formula-like text.
- Cleanup creates a separate copy and keeps the original dataset.

## Storage and privacy

This is a **single-user, browser-local application**. Files are processed on your device and are never sent to the local server. The server only serves the HTML, CSS, and JavaScript.

Imported files and saved views are specific to your browser profile and the URL origin. Different ports, browsers, or profiles have separate workspaces. Clearing site data, using private browsing, or browser storage eviction may remove your workspace. Export important data to keep a backup.

This version has no login, shared team workspace, cloud synchronization, or backend database. The server binds to `127.0.0.1` for local use.

## Checks

```bash
npm run check
npm test
```

The tests cover parser edge cases, filters, numeric/date handling, sorting, cleanup, exports, sample integrity, and local server responses. The original preview's search, combined filters, sorting, saved views, column selection, and CSV download were checked in a browser. Automated file-picker testing did not complete in that environment. This downloadable project was recreated after temporary workspace cleanup and checked with the included automated tests; a new full browser walkthrough was not completed.

### Manual check on your computer

1. Upload `examples/cleanup_demo.csv`: expect 3 rows, 4 columns, and one empty cell.
2. Choose **Tidy up data → Create clean copy**: expect 2 rows and the original file to remain under **My files**.
3. Open the built-in sample and apply `Status is Completed` plus `Amount is greater than 40`: expect 81 matching rows.
4. Hide Country, export the current view, and open the resulting CSV: expect 81 data rows and 7 columns.
5. Save a view, refresh, and open it from **Saved views**.
