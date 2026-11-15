import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, normalize } from '../src/database.js';
import { createCatalog } from '../src/catalog.js';
import { assessOperation, createTelemetry, loadControl } from '../src/observability.js';
import { parse, getOperationAST } from 'graphql';

function fixture(t) {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  const add = db.prepare('INSERT INTO universities VALUES (?, ?, ?, ?, ?, ?, ?)');
  const index = db.prepare('INSERT INTO universities_fts VALUES (?, ?)');
  for (const [id, name, country] of [['1', 'École Paris', 'FR'], ['2', 'Alpha Institute', 'US'], ['3', 'Beta College', 'US'], ['4', 'Beta College', 'FR']]) {
    add.run(id, name, country, null, '["example.edu"]', '["https://example.edu"]', normalize(`${name} example.edu`));
    index.run(id, normalize(`${name} example.edu`));
  }
  return createCatalog(db);
}

test('поиск по подстроке и диакритике, фильтры, сортировка и стабильные страницы', t => {
  const catalog = fixture(t);
  assert.equal(catalog.list('universities', { filter: { search: 'école' } }).nodes[0].id, '1');
  assert.equal(catalog.list('universities', { filter: { search: 'aris' } }).nodes[0].id, '1');
  assert.equal(catalog.list('universities', { filter: { search: 'example.edu', countryId: 'us' } }).total, 2);
  assert.equal(catalog.list('universities', { filter: { search: "' OR 1=1 --" } }).total, 0);
  assert.equal(catalog.list('universities', { filter: { search: '%' } }).total, 0);
  const first = catalog.list('universities', { page: { size: 2 } });
  const second = catalog.list('universities', { page: { number: 2, size: 2 } });
  assert.equal(first.pageInfo.totalPages, 2);
  assert.equal(first.pageInfo.hasNextPage, true);
  assert.equal(second.pageInfo.hasNextPage, false);
  assert.deepEqual(new Set([...first.nodes, ...second.nodes].map(row => row.id)).size, 4);
  assert.equal(catalog.list('universities', { sort: 'NAME_DESC' }).nodes[0].id, '1');
});

test('параметры и мутации проверяются, избранное сохраняет заметку', t => {
  const catalog = fixture(t);
  assert.throws(() => catalog.list('universities', { page: { size: 101 } }), /размер/i);
  assert.throws(() => catalog.list('universities', { page: { number: -1 } }), /Номер/);
  assert.throws(() => catalog.list('universities', { sort: 'AREA_DESC' }), /сортировки/);
  assert.throws(() => catalog.list('universities', { filter: { search: 'x'.repeat(121) } }), /120/);
  assert.throws(() => catalog.setFavorite('missing', true), /не найден/);
  assert.throws(() => catalog.setFavorite('1', true, 'x'.repeat(1001)), /1000/);
  catalog.setFavorite('1', true, '  Проверить программу  ');
  assert.equal(catalog.favorite('1').note, 'Проверить программу');
  assert.equal(catalog.list('universities', { filter: { favoritesOnly: true } }).total, 1);
  catalog.setFavorite('1', false);
  assert.equal(catalog.favorite('1'), null);
});

test('стоимость учитывает переменные, алиасы и вложенные фрагменты', () => {
  const doc = parse('query X($p: PageInput) { a: countries(page: $p) { nodes { ...C } } } fragment C on Country { universities(page:{size:100}) { nodes { country { cities(page:{size:100}) { nodes { name } } } } } }');
  assert.throws(() => assessOperation(doc, getOperationAST(doc, 'X'), { p: { size: 100 } }), error => error.extensions.code === 'QUERY_TOO_COMPLEX');
  const normal = parse('{ countries(page: {size: 5}) { nodes { name } } }');
  assert.ok(assessOperation(normal, getOperationAST(normal)).cost < 15000);
  const invalid = parse('query X($p: PageInput) { countries(page: $p) { total } }');
  assert.throws(() => assessOperation(invalid, getOperationAST(invalid), { p: { size: 0 } }), error => error.extensions.code === 'BAD_USER_INPUT');
});

test('ограничение нагрузки возвращает 429 и Retry-After', () => {
  const telemetry = createTelemetry();
  const middleware = loadControl(telemetry, { limit: 1, maxActive: 2 });
  let next = 0;
  const response = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  const request = { socket: { remoteAddress: '127.0.0.1' } };
  middleware(request, response, () => next++);
  middleware(request, response, () => next++);
  assert.equal(next, 1);
  assert.equal(response.code, 429);
  assert.equal(response.headers['Retry-After'], '60');
  assert.equal(telemetry.state.rejected, 1);
});
