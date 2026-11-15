const test = require('node:test');
const assert = require('node:assert/strict');
const { passwordOk } = require('../lib/passwords');
const { canReadTasks, canCreateTask, canMutateTask, canManageUsers } = require('../lib/roles');
const { signAccess, signRefresh, verifyAccess, verifyRefresh } = require('../lib/tokens');

test('password policy requires letters, digits, and a supported length', () => {
  assert.equal(passwordOk('Abcdef12'), true);
  assert.equal(passwordOk('abcdefgh'), false);
  assert.equal(passwordOk('12345678'), false);
  assert.equal(passwordOk('Ab1'), false);
  assert.equal(passwordOk('a'.repeat(71) + '1'), true);
  assert.equal(passwordOk('a'.repeat(72) + '1'), false);
});

test('roles restrict task changes to owners or administrators', () => {
  assert.equal(canReadTasks('viewer'), true);
  assert.equal(canCreateTask('viewer'), false);
  assert.equal(canCreateTask('editor'), true);
  assert.equal(canMutateTask('editor', 'user-1', { owner: 'user-1' }), true);
  assert.equal(canMutateTask('editor', 'user-1', { owner: 'user-2' }), false);
  assert.equal(canMutateTask('admin', 'user-1', { owner: 'user-2' }), true);
  assert.equal(canManageUsers('admin'), true);
  assert.equal(canManageUsers('editor'), false);
});

test('access and refresh keys have separate token types', () => {
  const secret = 'ci-test-secret';
  const access = signAccess({ sub: 'user-1', sid: 'session-1' }, { secret });
  const refresh = signRefresh({ sub: 'user-1', sid: 'session-1' }, { secret });
  assert.equal(verifyAccess(access, { secret }).typ, 'access');
  assert.equal(verifyRefresh(refresh, { secret }).typ, 'refresh');
  assert.throws(() => verifyAccess(refresh, { secret }), { status: 401 });
  assert.throws(() => verifyRefresh(access, { secret }), { status: 401 });
});
