import assert from 'node:assert/strict';
import test from 'node:test';
import { PendingPermissionRegistry } from './pending-permissions.ts';

const registry = () => new PendingPermissionRegistry<string>(60_000);

test('returns a pending request exactly once', () => {
  const pending = registry();
  pending.add('request-1', 'tab-1', 'allow camera');

  assert.equal(pending.size, 1);
  assert.equal(pending.take('request-1'), 'allow camera');
  assert.equal(pending.take('request-1'), undefined);
  assert.equal(pending.size, 0);
});

test('cancels only the requests opened by the tab that went away', () => {
  const pending = registry();
  pending.add('request-1', 'tab-1', 'camera');
  pending.add('request-2', 'tab-1', 'position');
  pending.add('request-3', 'tab-2', 'notifications');

  assert.deepEqual(pending.cancelForTab('tab-1'), [
    { id: 'request-1', value: 'camera' },
    { id: 'request-2', value: 'position' }
  ]);
  assert.equal(pending.size, 1);
  assert.equal(pending.take('request-3'), 'notifications');
});

test('expires unanswered requests once their lifetime is over', () => {
  const pending = registry();
  pending.add('request-1', 'tab-1', 'camera', 1_000);
  pending.add('request-2', 'tab-2', 'position', 50_000);

  assert.deepEqual(pending.expire(60_999), []);
  assert.deepEqual(pending.expire(61_000), [{ id: 'request-1', value: 'camera' }]);
  assert.equal(pending.size, 1);
  assert.deepEqual(pending.expire(110_000), [{ id: 'request-2', value: 'position' }]);
  assert.equal(pending.size, 0);
});

test('drains every remaining request', () => {
  const pending = registry();
  pending.add('request-1', 'tab-1', 'camera');
  pending.add('request-2', 'tab-2', 'position');

  assert.equal(pending.drain().length, 2);
  assert.equal(pending.size, 0);
  assert.deepEqual(pending.drain(), []);
});
