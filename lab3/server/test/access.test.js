const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { applyFailure, evaluateGuard, EMAIL_POLICY } = require('../lib/guards');
const { canCreateTask, canMutateTask, canManageUsers, canViewAllSessions } = require('../lib/roles');
const { passwordOk } = require('../lib/passwords');
const { signAccess, verifyAccess, hashesEqual, sha256 } = require('../lib/tokens');
const HttpError = require('../lib/httpError');

test('account locks after repeated failures and the window resets', () => {
  const now = 1_000_000;
  let state = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    state = applyFailure(state, now + attempt, EMAIL_POLICY);
  }
  assert.equal(state.fails, 4);
  assert.equal(state.lockedUntil, null);
  assert.equal(evaluateGuard(state, now).locked, false);

  state = applyFailure(state, now + 4, EMAIL_POLICY);
  assert.equal(state.fails, 5);
  assert.equal(evaluateGuard(state, now + 4).locked, true);
  assert.equal(evaluateGuard({ lockedUntil: new Date(state.lockedUntil) }, now + 4).locked, true);
  assert.equal(evaluateGuard(state, state.lockedUntil + 1).locked, false);

  const reset = applyFailure(state, state.lockedUntil + 5, EMAIL_POLICY);
  assert.equal(reset.fails, 1);
  assert.equal(reset.lockedUntil, null);
});

test('roles gate tasks, users and sessions', () => {
  assert.equal(canCreateTask('viewer'), false);
  assert.equal(canCreateTask('editor'), true);
  assert.equal(canCreateTask('admin'), true);
  assert.equal(canMutateTask('viewer', 'u1', { owner: 'u1' }), false);
  assert.equal(canMutateTask('editor', 'u1', { owner: 'u1' }), true);
  assert.equal(canMutateTask('editor', 'u1', { owner: { _id: 'u2' } }), false);
  assert.equal(canMutateTask('admin', 'u1', { owner: 'u2' }), true);
  assert.equal(canManageUsers('editor'), false);
  assert.equal(canManageUsers('admin'), true);
  assert.equal(canViewAllSessions('admin'), true);
  assert.equal(canViewAllSessions('viewer'), false);
});

test('password policy and temporary access keys', () => {
  assert.equal(passwordOk('short1'), false);
  assert.equal(passwordOk('longpassword'), false);
  assert.equal(passwordOk('Editor12345'), true);

  const secret = 'test-secret';
  const token = signAccess({ sub: 'user', sid: 'session', role: 'editor' }, { secret, expiresIn: '15m' });
  const payload = verifyAccess(token, { secret });
  assert.equal(payload.typ, 'access');
  assert.equal(payload.role, 'editor');
  assert.ok(payload.exp > payload.iat);

  const expired = jwt.sign(
    { sub: 'user', sid: 'session', role: 'viewer', typ: 'access', exp: Math.floor(Date.now() / 1000) - 10 },
    secret
  );
  assert.throws(() => verifyAccess(expired, { secret }), (err) => err instanceof HttpError && err.status === 401);

  const digest = sha256('refresh-token');
  assert.equal(hashesEqual(digest, digest), true);
  assert.equal(hashesEqual(digest, sha256('other')), false);
});
