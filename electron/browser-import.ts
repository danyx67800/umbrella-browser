import { createHash, randomUUID } from 'node:crypto';
import {
  copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

export type ImportedBookmark = { title: string; url: string };
export type ImportedVisit = { title: string; url: string; visitedAt: number };
export type ImportProfileInfo = {
  id: string;
  label: string;
  bookmarksAvailable: boolean;
  historyAvailable: boolean;
};
export type ImportBrowserInfo = {
  id: string;
  name: string;
  engine: 'Chromium' | 'Firefox' | 'Legacy';
  profiles: ImportProfileInfo[];
};
export type ImportBrowserOptions = { bookmarks: boolean; history: boolean };
export type BrowserImportPayload = {
  bookmarks: ImportedBookmark[];
  history: ImportedVisit[];
  browserName: string;
  profileName: string;
  warnings: string[];
};

type InternalProfile = ImportProfileInfo & {
  path: string;
  kind: 'chromium' | 'firefox' | 'favorites';
  bookmarksPath?: string;
  historyPath?: string;
};
type InternalBrowser = Omit<ImportBrowserInfo, 'profiles'> & { profiles: InternalProfile[] };
const customImportProfiles = new Map<string, InternalBrowser>();

const safeExists = (path: string) => {
  try { return existsSync(path) && statSync(path).isDirectory(); } catch { return false; }
};
const stableId = (value: string) => createHash('sha256').update(value.toLowerCase()).digest('hex').slice(0, 14);
const asHttpUrl = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch { return false; }
};

function listDirectories(path: string): string[] {
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(path, entry.name));
  } catch { return []; }
}

function chromiumProfiles(root: string): InternalProfile[] {
  if (!safeExists(root)) return [];
  const isProfileFolder = existsSync(join(root, 'Bookmarks')) || existsSync(join(root, 'History'));
  const directories = isProfileFolder
    ? [root]
    : listDirectories(root).filter((path) => {
        const name = basename(path);
        return name === 'Default' || /^Profile \d+$/i.test(name) || name === 'Guest Profile';
      });

  return directories.map((path, index) => {
    const folderName = basename(path);
    const label = folderName === 'Default' ? 'Profilo principale'
      : folderName === 'Guest Profile' ? 'Profilo ospite'
        : /^Profile \d+$/i.test(folderName) ? `Profilo ${folderName.replace(/\D/g, '')}`
          : `Profilo ${index + 1}`;
    const bookmarksPath = join(path, 'Bookmarks');
    const historyPath = join(path, 'History');
    return {
      id: stableId(`${path}|chromium`),
      path,
      label,
      kind: 'chromium' as const,
      bookmarksPath: existsSync(bookmarksPath) ? bookmarksPath : undefined,
      historyPath: existsSync(historyPath) ? historyPath : undefined,
      bookmarksAvailable: existsSync(bookmarksPath),
      historyAvailable: existsSync(historyPath)
    };
  }).filter((profile) => profile.bookmarksAvailable || profile.historyAvailable);
}

function parseProfilesIni(profilesIni: string, root: string): Array<{ path: string; name: string }> {
  const profiles: Array<{ path: string; name: string }> = [];
  let current: Record<string, string> | null = null;
  const commit = () => {
    if (!current || !current.Path) return;
    const resolvedPath = current.IsRelative === '0' ? current.Path : resolve(root, current.Path);
    profiles.push({ path: resolvedPath, name: current.Name || basename(resolvedPath) });
  };
  for (const line of profilesIni.split(/\r?\n/)) {
    const section = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (section) {
      commit();
      current = /^Profile\d+$/i.test(section[1]) ? {} : null;
      continue;
    }
    if (!current) continue;
    const value = line.match(/^\s*([^=]+?)\s*=\s*(.*?)\s*$/);
    if (value) current[value[1]] = value[2];
  }
  commit();
  return profiles;
}

function geckoProfiles(root: string): InternalProfile[] {
  if (!safeExists(root)) return [];
  let candidates: Array<{ path: string; name: string }> = [];
  // Some Gecko-based browsers point directly at a profile folder instead of
  // keeping a profiles.ini one level above it. Support both layouts and a
  // selected Firefox data folder that contains profiles.ini itself.
  if (existsSync(join(root, 'places.sqlite'))) {
    candidates = [{ path: root, name: basename(root) }];
  } else {
    const rootIni = join(root, 'profiles.ini');
    const parentIni = join(dirname(root), 'profiles.ini');
    const ini = existsSync(rootIni) ? rootIni : existsSync(parentIni) ? parentIni : '';
    const iniBase = ini === rootIni ? root : dirname(root);
    if (ini) {
      try { candidates = parseProfilesIni(readFileSync(ini, 'utf8'), iniBase); } catch { /* directory scan below */ }
    }
    if (!candidates.length) {
      candidates = listDirectories(root).map((path) => ({ path, name: basename(path) }));
    }
  }
  return candidates.filter(({ path }) => existsSync(join(path, 'places.sqlite'))).map(({ path, name }) => ({
    id: stableId(`${path}|firefox`),
    path,
    label: /default/i.test(name) ? 'Profilo principale' : name,
    kind: 'firefox' as const,
    bookmarksPath: join(path, 'places.sqlite'),
    historyPath: join(path, 'places.sqlite'),
    bookmarksAvailable: true,
    historyAvailable: true
  }));
}


function knownGeckoRoots(roaming: string): Array<{ id: string; name: string; root: string }> {
  return [
    { id: 'firefox', name: 'Mozilla Firefox', root: join(roaming, 'Mozilla/Firefox/Profiles') },
    { id: 'waterfox', name: 'Waterfox', root: join(roaming, 'Waterfox/Profiles') },
    { id: 'librewolf', name: 'LibreWolf', root: join(roaming, 'librewolf/Profiles') },
    { id: 'floorp', name: 'Floorp', root: join(roaming, 'Floorp/Profiles') },
    { id: 'zen', name: 'Zen Browser', root: join(roaming, 'zen/Profiles') },
    { id: 'palemoon', name: 'Pale Moon', root: join(roaming, 'Moonchild Productions/Pale Moon/Profiles') },
    { id: 'seamonkey', name: 'SeaMonkey', root: join(roaming, 'Mozilla/SeaMonkey/Profiles') },
    { id: 'mullvad', name: 'Mullvad Browser', root: join(roaming, 'Mullvad Browser/Profiles') }
  ];
}

function knownChromiumRoots(local: string, roaming: string): Array<{ id: string; name: string; root: string }> {
  const localRoot = (relativePath: string) => join(local, relativePath);
  const roamingRoot = (relativePath: string) => join(roaming, relativePath);
  return [
    { id: 'chrome', name: 'Google Chrome', root: localRoot('Google/Chrome/User Data') },
    { id: 'chrome-beta', name: 'Google Chrome Beta', root: localRoot('Google/Chrome Beta/User Data') },
    { id: 'chrome-dev', name: 'Google Chrome Dev', root: localRoot('Google/Chrome Dev/User Data') },
    { id: 'chrome-canary', name: 'Google Chrome Canary', root: localRoot('Google/Chrome SxS/User Data') },
    { id: 'edge', name: 'Microsoft Edge', root: localRoot('Microsoft/Edge/User Data') },
    { id: 'edge-beta', name: 'Microsoft Edge Beta', root: localRoot('Microsoft/Edge Beta/User Data') },
    { id: 'edge-dev', name: 'Microsoft Edge Dev', root: localRoot('Microsoft/Edge Dev/User Data') },
    { id: 'edge-canary', name: 'Microsoft Edge Canary', root: localRoot('Microsoft/Edge SxS/User Data') },
    { id: 'brave', name: 'Brave', root: localRoot('BraveSoftware/Brave-Browser/User Data') },
    { id: 'brave-beta', name: 'Brave Beta', root: localRoot('BraveSoftware/Brave-Browser-Beta/User Data') },
    { id: 'brave-nightly', name: 'Brave Nightly', root: localRoot('BraveSoftware/Brave-Browser-Nightly/User Data') },
    { id: 'vivaldi', name: 'Vivaldi', root: localRoot('Vivaldi/User Data') },
    { id: 'vivaldi-snapshot', name: 'Vivaldi Snapshot', root: localRoot('Vivaldi Snapshot/User Data') },
    { id: 'opera', name: 'Opera', root: roamingRoot('Opera Software/Opera Stable') },
    { id: 'opera-gx', name: 'Opera GX', root: roamingRoot('Opera Software/Opera GX Stable') },
    { id: 'opera-beta', name: 'Opera Beta', root: roamingRoot('Opera Software/Opera Next') },
    { id: 'chromium', name: 'Chromium', root: localRoot('Chromium/User Data') },
    { id: 'yandex', name: 'Yandex Browser', root: localRoot('Yandex/YandexBrowser/User Data') },
    { id: 'arc', name: 'Arc', root: localRoot('Arc/User Data') },
    { id: 'sidekick', name: 'Sidekick', root: localRoot('Sidekick/User Data') },
    { id: 'epic', name: 'Epic Privacy Browser', root: localRoot('Epic Privacy Browser/User Data') },
    { id: 'comodo-dragon', name: 'Comodo Dragon', root: localRoot('Comodo/Dragon/User Data') },
    { id: 'slimjet', name: 'Slimjet', root: localRoot('Slimjet/User Data') },
    { id: 'srware-iron', name: 'SRWare Iron', root: localRoot('SRWare Iron/User Data') },
    { id: 'cent-browser', name: 'Cent Browser', root: localRoot('CentBrowser/User Data') },
    { id: 'coc-coc', name: 'Cốc Cốc', root: localRoot('CocCoc/Browser/User Data') },
    { id: 'whale', name: 'Naver Whale', root: localRoot('Naver/Naver Whale/User Data') }
  ];
}

export function discoverBrowserProfiles(): ImportBrowserInfo[] {
  const local = process.env.LOCALAPPDATA || join(process.env.USERPROFILE || '', 'AppData/Local');
  const roaming = process.env.APPDATA || join(process.env.USERPROFILE || '', 'AppData/Roaming');
  const browsers: InternalBrowser[] = [];

  for (const definition of knownChromiumRoots(local, roaming)) {
    const profiles = chromiumProfiles(definition.root);
    if (profiles.length) browsers.push({ ...definition, engine: 'Chromium', profiles });
  }

  const geckoDefinitions = knownGeckoRoots(roaming);
  for (const definition of geckoDefinitions) {
    const profiles = geckoProfiles(definition.root);
    if (profiles.length) browsers.push({ ...definition, engine: 'Firefox', profiles });
  }

  const favoritesPath = join(process.env.USERPROFILE || '', 'Favorites');
  if (safeExists(favoritesPath)) {
    const hasUrlFiles = (directory: string): boolean => {
      for (const child of listDirectories(directory)) if (hasUrlFiles(child)) return true;
      try {
        return readdirSync(directory, { withFileTypes: true }).some((entry) => entry.isFile() && /\.url$/i.test(entry.name));
      } catch { return false; }
    };
    if (hasUrlFiles(favoritesPath)) {
      browsers.push({
        id: 'internet-explorer-favorites',
        name: 'Preferiti di Windows / Internet Explorer',
        engine: 'Legacy',
        profiles: [{
          id: stableId(`${favoritesPath}|favorites`),
          path: favoritesPath,
          label: 'Preferiti di Windows',
          kind: 'favorites',
          bookmarksAvailable: true,
          historyAvailable: false
        }]
      });
    }
  }

  return browsers
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ id, name, engine, profiles }) => ({
      id, name, engine,
      profiles: profiles.map(({ id: profileId, label, bookmarksAvailable, historyAvailable }) => ({
        id: profileId, label, bookmarksAvailable, historyAvailable
      }))
    }));
}

export function registerCustomBrowserProfile(selectedPath: string): ImportBrowserInfo {
  const root = resolve(selectedPath);
  if (!safeExists(root)) throw new Error('La cartella selezionata non esiste o non è accessibile.');

  // The picker lets the user target a profile folder, its browser data root,
  // or a parent folder such as Firefox's application data directory.
  const roots = [
    root,
    join(root, 'User Data'),
    join(root, 'Profiles'),
    join(root, 'Browser/TorBrowser/Data/Browser/profile.default'),
    join(root, 'TorBrowser/Data/Browser/profile.default')
  ];
  let profiles: InternalProfile[] = [];
  let engine: ImportBrowserInfo['engine'] = 'Chromium';
  for (const candidate of roots) {
    profiles = chromiumProfiles(candidate);
    if (profiles.length) break;
  }
  if (!profiles.length) {
    engine = 'Firefox';
    for (const candidate of roots) {
      profiles = geckoProfiles(candidate);
      if (profiles.length) break;
    }
  }
  if (!profiles.length) {
    throw new Error('Non è stato trovato un profilo Chromium o Firefox importabile nella cartella selezionata. Scegli la cartella User Data, Profiles o quella del profilo.');
  }

  const id = `custom-${stableId(`${root}|custom`)}`;
  const browser: InternalBrowser = {
    id,
    name: `Altro browser · ${basename(root) || 'profilo personalizzato'}`,
    engine,
    profiles
  };
  customImportProfiles.set(id, browser);
  // Bound the in-memory cache in case the dialog is used repeatedly.
  while (customImportProfiles.size > 32) {
    const oldestKey = customImportProfiles.keys().next().value;
    if (oldestKey) customImportProfiles.delete(oldestKey); else break;
  }
  return {
    id: browser.id,
    name: browser.name,
    engine: browser.engine,
    profiles: browser.profiles.map(({ id: profileId, label, bookmarksAvailable, historyAvailable }) => ({
      id: profileId, label, bookmarksAvailable, historyAvailable
    }))
  };
}

function readChromiumBookmarks(path: string): ImportedBookmark[] {
  const root = JSON.parse(readFileSync(path, 'utf8')) as {
    roots?: Record<string, { children?: unknown[] }>;
  };
  const result: ImportedBookmark[] = [];
  const walk = (nodes: unknown[]) => {
    for (const value of nodes) {
      if (!value || typeof value !== 'object') continue;
      const node = value as { type?: string; name?: string; url?: string; children?: unknown[] };
      if (node.type === 'url' && asHttpUrl(node.url)) {
        result.push({ title: String(node.name || node.url).slice(0, 200), url: node.url });
      } else if (Array.isArray(node.children)) walk(node.children);
    }
  };
  for (const value of Object.values(root.roots ?? {})) {
    if (value && Array.isArray(value.children)) walk(value.children);
  }
  return result;
}

function readInternetFavorites(path: string): ImportedBookmark[] {
  const result: ImportedBookmark[] = [];
  const walk = (directory: string) => {
    let entries;
    try { entries = readdirSync(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const child = join(directory, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile() && /\.url$/i.test(entry.name)) {
        try {
          const contents = readFileSync(child, 'utf8');
          const match = contents.match(/^\s*URL\s*=\s*(https?:\/\/\S+)\s*$/im);
          if (match && asHttpUrl(match[1])) result.push({ title: basename(entry.name, '.url'), url: match[1] });
        } catch { /* skip unreadable shortcut */ }
      }
    }
  };
  walk(path);
  return result;
}

function withReadOnlySqliteCopy<T>(sourcePath: string, reader: (database: DatabaseSync) => T): T {
  const temporaryDirectory = join(tmpdir(), `umbrella-import-${randomUUID()}`);
  mkdirSync(temporaryDirectory, { recursive: true });
  const temporaryDatabase = join(temporaryDirectory, 'browser.sqlite');
  let database: DatabaseSync | null = null;
  try {
    copyFileSync(sourcePath, temporaryDatabase);
    for (const suffix of ['-wal', '-shm']) {
      const sidecar = `${sourcePath}${suffix}`;
      if (existsSync(sidecar)) copyFileSync(sidecar, `${temporaryDatabase}${suffix}`);
    }
    database = new DatabaseSync(temporaryDatabase);
    return reader(database);
  } finally {
    try { database?.close(); } catch { /* ignore close failure */ }
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function readSqliteBookmarks(path: string, kind: 'chromium' | 'firefox'): ImportedBookmark[] {
  return withReadOnlySqliteCopy(path, (db) => {
    if (kind === 'chromium') {
      const rows = db.prepare(`
        SELECT url, title FROM urls
        WHERE url LIKE 'http://%' OR url LIKE 'https://%'
        ORDER BY last_visit_time DESC LIMIT 20000
      `).all() as Array<{ url?: unknown; title?: unknown }>;
      return rows.filter((row) => asHttpUrl(row.url)).map((row) => ({
        title: String(row.title || row.url).slice(0, 200),
        url: row.url as string
      }));
    }
    const rows = db.prepare(`
      SELECT p.url AS url, COALESCE(b.title, p.title, p.url) AS title
      FROM moz_bookmarks b JOIN moz_places p ON p.id = b.fk
      WHERE b.type = 1 AND (p.url LIKE 'http://%' OR p.url LIKE 'https://%')
      ORDER BY b.dateAdded DESC LIMIT 20000
    `).all() as Array<{ url?: unknown; title?: unknown }>;
    return rows.filter((row) => asHttpUrl(row.url)).map((row) => ({
      title: String(row.title || row.url).slice(0, 200),
      url: row.url as string
    }));
  });
}

function readSqliteHistory(path: string, kind: 'chromium' | 'firefox'): ImportedVisit[] {
  return withReadOnlySqliteCopy(path, (db) => {
    if (kind === 'chromium') {
      const rows = db.prepare(`
        SELECT u.url AS url, u.title AS title, MAX(v.visit_time) AS visited
        FROM visits v JOIN urls u ON u.id = v.url
        WHERE u.url LIKE 'http://%' OR u.url LIKE 'https://%'
        GROUP BY u.id ORDER BY visited DESC LIMIT 3000
      `).all() as Array<{ url?: unknown; title?: unknown; visited?: unknown }>;
      return rows.filter((row) => asHttpUrl(row.url)).map((row) => ({
        title: String(row.title || row.url).slice(0, 200),
        url: row.url as string,
        visitedAt: Math.max(0, Math.round((Number(row.visited) / 1_000_000 - 11644473600) * 1000))
      })).filter((row) => row.visitedAt > 0);
    }
    const rows = db.prepare(`
      SELECT p.url AS url, p.title AS title, MAX(v.visit_date) AS visited
      FROM moz_historyvisits v JOIN moz_places p ON p.id = v.place_id
      WHERE p.url LIKE 'http://%' OR p.url LIKE 'https://%'
      GROUP BY p.id ORDER BY visited DESC LIMIT 3000
    `).all() as Array<{ url?: unknown; title?: unknown; visited?: unknown }>;
    return rows.filter((row) => asHttpUrl(row.url)).map((row) => ({
      title: String(row.title || row.url).slice(0, 200),
      url: row.url as string,
      visitedAt: Math.max(0, Math.round(Number(row.visited) / 1000))
    })).filter((row) => row.visitedAt > 0);
  });
}

export function importBrowserProfile(
  browserId: string,
  profileId: string,
  options: ImportBrowserOptions
): BrowserImportPayload {
  const local = process.env.LOCALAPPDATA || join(process.env.USERPROFILE || '', 'AppData/Local');
  const roaming = process.env.APPDATA || join(process.env.USERPROFILE || '', 'AppData/Roaming');
  let browserName = '';
  let profile: InternalProfile | undefined;

  const customBrowser = customImportProfiles.get(browserId);
  if (customBrowser) {
    browserName = customBrowser.name;
    profile = customBrowser.profiles.find((item) => item.id === profileId);
  } else {
    const browser = discoverBrowserProfiles().find((item) => item.id === browserId);
    if (!browser) throw new Error('Browser non trovato. Aggiorna l’elenco e riprova.');
    browserName = browser.name;
    const internal = [
      ...knownChromiumRoots(local, roaming).flatMap((definition) =>
        chromiumProfiles(definition.root).map((item) => ({ browserId: definition.id, profile: item }))),
      ...knownGeckoRoots(roaming).flatMap((definition) => geckoProfiles(definition.root).map((item) => ({ browserId: definition.id, profile: item }))),
      ...(browserId === 'internet-explorer-favorites' ? [{
        browserId,
        profile: {
          id: stableId(`${join(process.env.USERPROFILE || '', 'Favorites')}|favorites`),
          path: join(process.env.USERPROFILE || '', 'Favorites'),
          label: 'Preferiti di Windows',
          kind: 'favorites' as const,
          bookmarksAvailable: true,
          historyAvailable: false
        }
      }] : [])
    ];
    profile = internal.find((item) => item.browserId === browserId && item.profile.id === profileId)?.profile;
  }
  if (!profile) throw new Error('Profilo non disponibile. Il browser potrebbe essere stato chiuso o il profilo spostato.');

  const warnings: string[] = [];
  let bookmarks: ImportedBookmark[] = [];
  let history: ImportedVisit[] = [];

  if (options.bookmarks) {
    try {
      if (!profile.bookmarksAvailable) warnings.push('Questo profilo non contiene un archivio di preferiti riconosciuto.');
      else if (profile.kind === 'chromium' && profile.bookmarksPath) bookmarks = readChromiumBookmarks(profile.bookmarksPath);
      else if (profile.kind === 'firefox' && profile.bookmarksPath) bookmarks = readSqliteBookmarks(profile.bookmarksPath, 'firefox');
      else if (profile.kind === 'favorites') bookmarks = readInternetFavorites(profile.path);
    } catch (error) {
      warnings.push(`Preferiti: ${error instanceof Error ? error.message : 'lettura non riuscita.'}`);
    }
  }
  if (options.history) {
    try {
      if (!profile.historyAvailable || !profile.historyPath) warnings.push('La cronologia non è disponibile per questo profilo.');
      else history = readSqliteHistory(profile.historyPath, profile.kind === 'firefox' ? 'firefox' : 'chromium');
    } catch (error) {
      warnings.push(`Cronologia: ${error instanceof Error ? error.message : 'lettura non riuscita.'}`);
    }
  }

  return { bookmarks, history, browserName, profileName: profile.label, warnings };
}
