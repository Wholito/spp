import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function waitFor(url) {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: '{ __typename }' }), signal: AbortSignal.timeout(250) });
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Сервис не запустился: ${url}`);
}

test('HTTP: федерация, мутации, кэш, трассировки и отказ одного сервиса', { timeout: 60000 }, async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'spp-lab5-test-'));
  process.env.DATA_DIR = temp;
  process.env.RATE_LIMIT = '1000';
  const { openDatabase, normalize } = await import('../src/database.js');
  const db = openDatabase(path.join(temp, 'atlas.sqlite'));
  db.prepare('INSERT INTO countries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('BY', 'Belarus', 'Беларусь', 'Europe', 'Eastern Europe', '["Minsk"]', 207600, '["Belarusian", "Russian"]', '["Belarusian ruble"]', 'belarus беларусь');
  db.prepare('INSERT INTO cities VALUES (?, ?, ?, ?, ?)').run('625144', 'Minsk', 'BY', 'Minsk', 'minsk');
  db.prepare('INSERT INTO universities VALUES (?, ?, ?, ?, ?, ?, ?)').run('bsuir', 'BSUIR', 'BY', 'Minsk', '["bsuir.by"]', '["https://bsuir.by"]', normalize('BSUIR bsuir.by'));
  for (const table of ['countries', 'cities', 'universities']) db.exec(`INSERT INTO ${table}_fts SELECT id, search FROM ${table}`);
  db.close();
  const children = new Map();
  let gateway;
  let output = '';
  t.after(async () => {
    await gateway?.stop();
    for (const child of children.values()) {
      if (child.exitCode === null && child.signalCode === null) { const ended = once(child, 'exit'); child.kill(); await ended; }
    }
    assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(temp).startsWith('spp-lab5-test-'));
    await rm(temp, { recursive: true, force: true });
  });
  for (const name of ['countries', 'cities', 'universities']) {
    const port = await freePort();
    process.env[`${name.toUpperCase()}_URL`] = `http://127.0.0.1:${port}/graphql`;
    const child = spawn(process.execPath, ['src/subgraph.js', name], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output = (output + chunk).slice(-10000); });
    children.set(name, child);
    try { await waitFor(process.env[`${name.toUpperCase()}_URL`]); }
    catch (error) { throw new Error(`${error.message}\n${output}`); }
  }
  const { startGateway } = await import('../src/gateway.js');
  gateway = await startGateway({ port: 0 });
  const url = `http://127.0.0.1:${gateway.httpServer.address().port}`;
  const request = async (query, variables = {}) => {
    const response = await fetch(`${url}/graphql`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }) });
    return response.json();
  };

  await t.test('несколько уровней вложенности проходят через три сервиса', async () => {
    const result = await request('{ country(id:"BY") { name cities { nodes { name country { universities { nodes { name domains } } } } } } }');
    assert.equal(result.errors, undefined);
    assert.equal(result.data.country.cities.nodes[0].country.universities.nodes[0].name, 'BSUIR');
    assert.ok(result.extensions.traceId);
  });
  await t.test('поиск, алиасы, переменные, директивы и валидация', async () => {
    const result = await request('query Q($f: UniversityFilter, $details: Boolean!) { found: universities(filter:$f) { total nodes { name domains @include(if:$details) } } }', { f: { search: 'BSUIR', countryId: 'BY' }, details: false });
    assert.equal(result.data.found.total, 1);
    assert.equal(result.data.found.nodes[0].domains, undefined);
    const invalid = await request('{ universities(page:{size:101}) { total } }');
    assert.equal(invalid.errors[0].extensions.code, 'BAD_USER_INPUT');
  });
  await t.test('кэш сбрасывается мутацией, заметка доступна после сохранения', async () => {
    const query = '{ university(id:"bsuir") { favorite { note } } }';
    await request(query);
    assert.equal((await request(query)).extensions.cached, true);
    const saved = await request('mutation { setFavorite(universityId:"bsuir",enabled:true,note:"Моя заметка") { favorite { note } } }');
    assert.equal(saved.data.setFavorite.favorite.note, 'Моя заметка');
    const after = await request(query);
    assert.equal(after.extensions.cached, false);
    assert.equal(after.data.university.favorite.note, 'Моя заметка');
    assert.equal((await request('{ universities(filter:{favoritesOnly:true}) { total } }')).data.universities.total, 1);
  });
  await t.test('слишком дорогой запрос отклоняется до обращения к сервисам', async () => {
    const result = await request('{ countries(page:{size:100}) { nodes { universities(page:{size:100}) { nodes { country { cities(page:{size:100}) { nodes { name } } } } } } } }');
    assert.equal(result.errors[0].extensions.code, 'QUERY_TOO_COMPLEX');
  });
  await t.test('при отказе cities другие поля остаются доступны', async () => {
    const child = children.get('cities');
    const ended = once(child, 'exit');
    child.kill();
    await ended;
    const result = await request('{ country(id:"BY") { localName } cities { total } universities { total } }');
    assert.equal(result.data.country.localName, 'Беларусь');
    assert.equal(result.data.universities.total, 1);
    assert.equal(result.data.cities, null);
    assert.ok(result.errors.length);
  });
  await t.test('мониторинг содержит трассы сервисов и метрики', async () => {
    const result = await request('{ monitor { requests errors cacheHits traces { id spans { service ok } } } }');
    assert.ok(result.data.monitor.requests >= 8);
    assert.ok(result.data.monitor.errors >= 1);
    assert.ok(result.data.monitor.cacheHits >= 1);
    assert.ok(result.data.monitor.traces.some(trace => trace.spans.some(span => span.service === 'countries')));
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.ok((await response.text()).includes('Атлас'));
  });
});
