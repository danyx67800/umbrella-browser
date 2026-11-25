import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUmbrellaActivity, isValidDiscordClientId } from './discord-presence.ts';

test('accepts Discord application IDs containing 17 to 20 digits', () => {
  assert.equal(isValidDiscordClientId('12345678901234567'), true);
  assert.equal(isValidDiscordClientId('12345678901234567890'), true);
});

test('rejects malformed Discord application IDs', () => {
  assert.equal(isValidDiscordClientId('1234567890123456'), false);
  assert.equal(isValidDiscordClientId('123456789012345678901'), false);
  assert.equal(isValidDiscordClientId('12345678901234567x'), false);
});

test('sets the uploaded Umbrella logo asset in Discord activity', () => {
  assert.deepEqual(buildUmbrellaActivity(), {
    details: 'Naviga con Umbrella',
    state: 'Browser in uso',
    largeImageKey: 'umbrella',
    largeImageText: 'Umbrella Browser'
  });
});
