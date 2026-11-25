import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { discoverBrowserProfiles, importBrowserProfile, registerCustomBrowserProfile } from './browser-import.ts';

function withFakeBrowserEnvironment(run: (paths: { root: string; local: string; roaming: string; home: string }) => void) {
  const root = mkdtempSync(join(tmpdir(), 'umbrella-browser-import-test-'));
  const original = {
    LOCALAPPDATA: process.env.LOCALAPPDATA,
    APPDATA: process.env.APPDATA,
    USERPROFILE: process.env.USERPROFILE
  };
  const paths = {
    root,
    local: join(root, 'Local'),
    roaming: join(root, 'Roaming'),
    home: join(root, 'Home')
  };
  mkdirSync(paths.local, { recursive: true });
  mkdirSync(paths.roaming, { recursive: true });
  mkdirSync(paths.home, { recursive: true });
  process.env.LOCALAPPDATA = paths.local;
  process.env.APPDATA = paths.roaming;
  process.env.USERPROFILE = paths.home;
  try { run(paths); }
  finally {
    if (original.LOCALAPPDATA === undefined) delete process.env.LOCALAPPDATA; else process.env.LOCALAPPDATA = original.LOCALAPPDATA;
    if (original.APPDATA === undefined) delete process.env.APPDATA; else process.env.APPDATA = original.APPDATA;
    if (original.USERPROFILE === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = original.USERPROFILE;
    rmSync(root, { recursive: true, force: true });
  }
}

test('detects Chrome profile and imports saved bookmarks without duplicate profile entries', () => {
  withFakeBrowserEnvironment(({ local }) => {
    const profilePath = join(local, 'Google/Chrome/User Data/Default');
    mkdirSync(profilePath, { recursive: true });
    writeFileSync(join(profilePath, 'Bookmarks'), JSON.stringify({
      roots: {
        bookmark_bar: {
          children: [
            { type: 'url', name: 'OpenAI', url: 'https://openai.com/' },
            { type: 'folder', name: 'Tools', children: [{ type: 'url', name: 'Example', url: 'https://example.com/' }] }
          ]
        },
        other: { children: [] }
      }
    }));
    writeFileSync(join(profilePath, 'History'), 'placeholder');
    const detected = discoverBrowserProfiles();
    const chrome = detected.find((browser) => browser.id === 'chrome');
    assert.ok(chrome);
    assert.equal(chrome.name, 'Google Chrome');
    assert.equal(chrome.profiles[0].bookmarksAvailable, true);
    assert.equal(chrome.profiles[0].historyAvailable, true);

    const imported = importBrowserProfile('chrome', chrome.profiles[0].id, { bookmarks: true, history: false });
    assert.equal(imported.bookmarks.length, 2);
    assert.equal(imported.bookmarks[0].title, 'OpenAI');
    assert.equal(imported.history.length, 0);
  });
});

test('detects Firefox profiles and imports bookmarks from a safe SQLite copy', () => {
  withFakeBrowserEnvironment(({ roaming }) => {
    const firefoxRoot = join(roaming, 'Mozilla/Firefox');
    const profilePath = join(firefoxRoot, 'Profiles', 'test.default-release');
    mkdirSync(profilePath, { recursive: true });
    writeFileSync(join(firefoxRoot, 'profiles.ini'), [
      '[Profile0]',
      'Name=Default Release',
      'IsRelative=1',
      'Path=Profiles/test.default-release',
      ''
    ].join('\n'));

    const db = new DatabaseSync(join(profilePath, 'places.sqlite'));
    db.exec(`
      CREATE TABLE moz_places (id INTEGER PRIMARY KEY, url TEXT, title TEXT);
      CREATE TABLE moz_bookmarks (id INTEGER PRIMARY KEY, type INTEGER, fk INTEGER, title TEXT, dateAdded INTEGER);
      CREATE TABLE moz_historyvisits (id INTEGER PRIMARY KEY, place_id INTEGER, visit_date INTEGER);
      INSERT INTO moz_places (id, url, title) VALUES (1, 'https://mozilla.org/', 'Mozilla');
      INSERT INTO moz_bookmarks (id, type, fk, title, dateAdded) VALUES (1, 1, 1, 'Mozilla', 1000);
      INSERT INTO moz_historyvisits (id, place_id, visit_date) VALUES (1, 1, 1700000000000000);
    `);
    db.close();

    const firefox = discoverBrowserProfiles().find((browser) => browser.id === 'firefox');
    assert.ok(firefox);
    assert.equal(firefox.profiles.length, 1);
    const imported = importBrowserProfile('firefox', firefox.profiles[0].id, { bookmarks: true, history: true });
    assert.deepEqual(imported.bookmarks, [{ title: 'Mozilla', url: 'https://mozilla.org/' }]);
    assert.equal(imported.history[0]?.url, 'https://mozilla.org/');
    assert.equal(imported.history[0]?.visitedAt, 1700000000000);
  });
});

test('detects a Gecko browser that stores the profile directly in its profile root', () => {
  withFakeBrowserEnvironment(({ roaming }) => {
    const profileRoot = join(roaming, 'Mullvad Browser/Profiles');
    mkdirSync(profileRoot, { recursive: true });
    const db = new DatabaseSync(join(profileRoot, 'places.sqlite'));
    db.exec(`
      CREATE TABLE moz_places (id INTEGER PRIMARY KEY, url TEXT, title TEXT);
      CREATE TABLE moz_bookmarks (id INTEGER PRIMARY KEY, type INTEGER, fk INTEGER, title TEXT, dateAdded INTEGER);
      CREATE TABLE moz_historyvisits (id INTEGER PRIMARY KEY, place_id INTEGER, visit_date INTEGER);
      INSERT INTO moz_places (id, url, title) VALUES (1, 'https://mullvad.net/', 'Mullvad');
      INSERT INTO moz_bookmarks (id, type, fk, title, dateAdded) VALUES (1, 1, 1, 'Mullvad', 1000);
    `);
    db.close();

    const mullvad = discoverBrowserProfiles().find((browser) => browser.id === 'mullvad');
    assert.ok(mullvad);
    assert.equal(mullvad.profiles.length, 1);
    const imported = importBrowserProfile('mullvad', mullvad.profiles[0].id, { bookmarks: true, history: false });
    assert.deepEqual(imported.bookmarks, [{ title: 'Mullvad', url: 'https://mullvad.net/' }]);
  });
});


test('allows importing a custom Chromium profile folder chosen by the user', () => {
  withFakeBrowserEnvironment(({ root }) => {
    const userData = join(root, 'Custom Browser', 'User Data');
    const profilePath = join(userData, 'Default');
    mkdirSync(profilePath, { recursive: true });
    writeFileSync(join(profilePath, 'Bookmarks'), JSON.stringify({
      roots: { bookmark_bar: { children: [{ type: 'url', name: 'Custom', url: 'https://custom.example/' }] } }
    }));

    const customBrowser = registerCustomBrowserProfile(userData);
    assert.equal(customBrowser.engine, 'Chromium');
    assert.equal(customBrowser.profiles.length, 1);
    const imported = importBrowserProfile(customBrowser.id, customBrowser.profiles[0].id, { bookmarks: true, history: false });
    assert.deepEqual(imported.bookmarks, [{ title: 'Custom', url: 'https://custom.example/' }]);
  });
});
