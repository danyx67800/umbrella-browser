import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assetFileName,
  buildReleaseApiUrls,
  matchAssetName,
  normalizeAssetName,
  rewriteUpdateInfoAssets
} from './update-assets.ts';

test('accepts the dotted asset name for an installer declared with dashes', () => {
  const assets = ['Umbrella.setup.0.4.4.exe', 'Umbrella.setup.0.4.4.exe.blockmap'];

  assert.equal(matchAssetName('Umbrella-Setup-0.4.4.exe', assets), 'Umbrella.setup.0.4.4.exe');
  assert.equal(matchAssetName('Umbrella-Setup-0.4.4.exe.blockmap', assets), 'Umbrella.setup.0.4.4.exe.blockmap');
});

test('accepts the same name with spaces, underscores or different casing', () => {
  assert.equal(matchAssetName('Umbrella-Setup-0.4.4.exe', ['Umbrella Setup 0.4.4.exe']), 'Umbrella Setup 0.4.4.exe');
  assert.equal(matchAssetName('Umbrella-Setup-0.4.4.exe', ['Umbrella_Setup_0.4.4.EXE']), 'Umbrella_Setup_0.4.4.EXE');
  assert.equal(matchAssetName('Umbrella-Setup-0.4.4.exe', ['UMBRELLA.SETUP.0.4.4.EXE']), 'UMBRELLA.SETUP.0.4.4.EXE');
});

test('keeps an exact match when the release publishes both spellings', () => {
  const assets = ['Umbrella.Setup.0.4.4.exe', 'Umbrella-Setup-0.4.4.exe'];

  assert.equal(matchAssetName('Umbrella-Setup-0.4.4.exe', assets), 'Umbrella-Setup-0.4.4.exe');
});

test('matches an absolute asset URL by its file name', () => {
  assert.equal(
    matchAssetName('https://github.com/perosss03-spec/umbrella-browser/releases/download/v0.4.4/Umbrella-Setup-0.4.4.exe', ['Umbrella.setup.0.4.4.exe']),
    'Umbrella.setup.0.4.4.exe'
  );
  assert.equal(assetFileName('https://example.com/a/Umbrella%20Setup.exe?token=1#frag'), 'Umbrella Setup.exe');
});

test('does not match a different version or a different product', () => {
  const assets = ['Umbrella.setup.0.4.5.exe', 'Something-Else-0.4.4.exe'];

  assert.equal(matchAssetName('Umbrella-Setup-0.4.4.exe', assets), null);
  assert.equal(matchAssetName('Umbrella-Setup-0.4.4.exe', []), null);
});

test('normalizes separators for comparison only', () => {
  assert.equal(normalizeAssetName('Umbrella-Setup-0.4.4.exe'), 'umbrellasetup044exe');
  assert.equal(normalizeAssetName('Umbrella.setup.0.4.4.exe'), 'umbrellasetup044exe');
  assert.notEqual(normalizeAssetName('Umbrella-Setup-0.4.40.exe'), 'umbrellasetup044exe');
});

test('rewrites every file entry that maps to a published asset', () => {
  const info = { files: [{ url: 'Umbrella-Setup-0.4.4.exe' }, { url: 'Umbrella-Setup-0.4.4.exe.blockmap' }] };

  const changes = rewriteUpdateInfoAssets(info, ['Umbrella.setup.0.4.4.exe', 'Umbrella.setup.0.4.4.exe.blockmap']);

  assert.deepEqual(info.files.map((file) => file.url), ['Umbrella.setup.0.4.4.exe', 'Umbrella.setup.0.4.4.exe.blockmap']);
  assert.equal(changes.length, 2);
});

test('leaves entries untouched when the release does not list them', () => {
  const info = { files: [{ url: 'Umbrella-Setup-0.4.4.exe' }] };

  assert.deepEqual(rewriteUpdateInfoAssets(info, ['Other.exe']), []);
  assert.equal(info.files[0].url, 'Umbrella-Setup-0.4.4.exe');
});

test('builds the release API URLs with and without the v prefix', () => {
  assert.deepEqual(buildReleaseApiUrls('0.5.0'), [
    'https://api.github.com/repos/perosss03-spec/umbrella-browser/releases/tags/v0.5.0',
    'https://api.github.com/repos/perosss03-spec/umbrella-browser/releases/tags/0.5.0'
  ]);
});
