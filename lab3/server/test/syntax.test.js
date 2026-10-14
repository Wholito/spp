const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

const files = (dir, acc = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'uploads' || entry.name === 'outbox') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files(full, acc);
    else if (entry.name.endsWith('.js')) acc.push(full);
  }
  return acc;
};

test('server sources parse', () => {
  const sources = files(root);
  assert.ok(sources.length > 10);
  for (const file of sources) {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  }
});
