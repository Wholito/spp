const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStore } = require('../store');

test('state survives a new store instance', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rubezh-'));
  const file = path.join(dir, 'nested', 'state.json');
  const first = createStore(file);
  assert.deepEqual(first.load(), { rooms: [] });
  first.save({ rooms: [{ code: 'ABCD', cells: [], players: [] }] });
  first.save({ rooms: [{ code: 'WXYZ', cells: [1], players: [] }] });
  const second = createStore(file);
  assert.equal(second.load().rooms[0].code, 'WXYZ');
});
