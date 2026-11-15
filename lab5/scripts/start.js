import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { root, dataDir, serviceUrl, ports } from '../src/config.js';
import path from 'node:path';
import { importData } from '../src/importer.js';

try { await readFile(path.join(dataDir, 'import-report.json')); }
catch { await importData(); }

const children = new Map();
let stopping = false;
let refresh;
function launch(name, file, args = []) {
  const env = { ...process.env };
  if (name !== 'gateway') env.PORT = String(ports[name]);
  const child = spawn(process.execPath, [file, ...args], { cwd: root, env, stdio: 'inherit', windowsHide: true });
  children.set(name, child);
  child.once('exit', () => {
    children.delete(name);
    if (!stopping) {
      console.error(`${name}: процесс завершился; перезапуск через 2 секунды.`);
      setTimeout(() => { if (!stopping) launch(name, file, args); }, 2000);
    }
  });
  child.once('error', error => console.error(`${name}: ${error.message}`));
}
function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(refresh);
  for (const child of children.values()) child.kill();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const name of ['countries', 'cities', 'universities']) launch(name, 'src/subgraph.js', [name]);
for (let attempt = 0; attempt < 60; attempt++) {
  const results = await Promise.all(['countries', 'cities', 'universities'].map(async name => {
    try {
      const response = await fetch(serviceUrl(name), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: '{ __typename }' }), signal: AbortSignal.timeout(500) });
      return response.ok;
    } catch { return false; }
  }));
  if (results.every(Boolean) || stopping) break;
  await new Promise(resolve => setTimeout(resolve, 500));
}
if (!stopping) {
  launch('gateway', 'src/gateway.js');
  refresh = setInterval(() => importData().catch(error => console.error(`Обновление: ${error.message}`)), 24 * 60 * 60 * 1000);
}
