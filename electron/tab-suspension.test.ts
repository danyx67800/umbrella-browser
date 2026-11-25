import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldSuspendTab, type SuspendableTab } from './tab-suspension.ts';

const tab = (overrides: Partial<SuspendableTab> = {}): SuspendableTab => ({
  id: 'tab-2',
  url: 'https://example.com/',
  incognito: false,
  loading: false,
  audible: false,
  inactiveSince: 0,
  ...overrides
});

test('suspends a normal, inactive tab after its configured idle time', () => {
  assert.equal(shouldSuspendTab(tab(), 'tab-1', 5, 5 * 60_000), true);
  assert.equal(shouldSuspendTab(tab(), 'tab-1', 5, 5 * 60_000 - 1), false);
});

test('never suspends active, private, loading, or audible tabs', () => {
  assert.equal(shouldSuspendTab(tab(), 'tab-2', 5, 60 * 60_000), false);
  assert.equal(shouldSuspendTab(tab({ incognito: true }), 'tab-1', 5, 60 * 60_000), false);
  assert.equal(shouldSuspendTab(tab({ loading: true }), 'tab-1', 5, 60 * 60_000), false);
  assert.equal(shouldSuspendTab(tab({ audible: true }), 'tab-1', 5, 60 * 60_000), false);
});

test('does not suspend disabled, new-tab, unsafe, or recently active tabs', () => {
  assert.equal(shouldSuspendTab(tab(), 'tab-1', 0, 60 * 60_000), false);
  assert.equal(shouldSuspendTab(tab({ url: '' }), 'tab-1', 5, 60 * 60_000), false);
  assert.equal(shouldSuspendTab(tab({ url: 'file:///secret' }), 'tab-1', 5, 60 * 60_000), false);
  assert.equal(shouldSuspendTab(tab({ inactiveSince: 60_000 }), 'tab-1', 5, 5 * 60_000), false);
});
