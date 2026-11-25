import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

test('default server port is 3020', async () => {
  const source = await readFile(fileURLToPath(new URL('../server.mjs',import.meta.url)),'utf8');
  assert.match(source,/process\.env\.PORT \|\| 3020/);
});

test('local server serves assets with correct MIME types and limits file access', {timeout:15000}, async t => {
  const socket = createServer();
  await new Promise(resolve => socket.listen(0,'127.0.0.1',resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const child = spawn(process.execPath,[fileURLToPath(new URL('../server.mjs',import.meta.url)),String(port)],{stdio:['ignore','pipe','pipe']});
  t.after(() => child.kill());
  await new Promise((resolve,reject) => {
    const timer = setTimeout(() => reject(new Error('Server did not start')),5000);
    const settle = action => { clearTimeout(timer); action(); };
    child.on('error',error => settle(() => reject(error)));
    child.on('exit',code => settle(() => reject(new Error(`Server exited with code ${code}`))));
    child.stdout.on('data',chunk => { if (chunk.toString().includes('Cella is ready')) settle(resolve); });
    child.stderr.on('data',chunk => settle(() => reject(new Error(chunk.toString()))));
  });
  const origin = `http://127.0.0.1:${port}`;
  for (const [path,contentType] of [['/','text/html'],['/style.css','text/css'],['/app.mjs','text/javascript'],['/data.mjs','text/javascript'],['/storage.mjs','text/javascript'],['/tasks.mjs','text/javascript'],['/worker.mjs','text/javascript'],['/favicon.svg','image/svg+xml']]) {
    const response = await fetch(origin+path);
    assert.equal(response.status,200,path);
    assert.ok(response.headers.get('content-type').includes(contentType));
    assert.ok((await response.text()).length > 0);
  }
  assert.equal((await fetch(origin+'/package.json')).status,404);
  assert.equal((await fetch(origin+'/%2e%2e%2fpackage.json')).status,403);
  assert.equal((await fetch(origin+'/',{method:'POST'})).status,405);
  const head = await fetch(origin+'/',{method:'HEAD'});
  assert.equal(head.status,200); assert.equal(await head.text(),'');
});
