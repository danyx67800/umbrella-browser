import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type Bookmark = { id: string; title: string; url: string; createdAt: number };
export type Visit = { id: string; title: string; url: string; visitedAt: number };
export type InstalledExtension = {
  id: string;
  name: string;
  version: string;
  path: string;
  enabled: boolean;
};
export type AppSettings = {
  theme: 'dark' | 'light' | 'system';
  accent: string;
  restoreSession: boolean;
  askDownloadLocation: boolean;
  downloadNotifications: boolean;
  wallpaperPath: string | null;
  adBlockEnabled: boolean;
};
export type PersistedTab = { url: string; title: string };
export type Database = {
  version: 2;
  bookmarks: Bookmark[];
  history: Visit[];
  settings: AppSettings;
  lastSession: PersistedTab[];
  extensions: InstalledExtension[];
};

const defaultDb = (): Database => ({
  version: 2,
  bookmarks: [],
  history: [],
  settings: {
    theme: 'dark',
    accent: '#8299ff',
    restoreSession: true,
    askDownloadLocation: false,
    downloadNotifications: true,
    wallpaperPath: null,
    adBlockEnabled: true
  },
  lastSession: [],
  extensions: []
});

const dataDirectory = () => join(app.getPath('userData'), 'Umbrella');
const databasePath = () => join(dataDirectory(), 'browser-data.json');
let database: Database = defaultDb();

export function loadDatabase() {
  try {
    const path = databasePath();
    if (existsSync(path)) {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<Database>;
      database = {
        ...defaultDb(),
        ...parsed,
        version: 2,
        extensions: Array.isArray(parsed.extensions) ? parsed.extensions : [],
        settings: { ...defaultDb().settings, ...parsed.settings }
      };
      // Version 1 databases are upgraded in place without replacing user data.
      saveDatabase();
    } else {
      database = defaultDb();
      saveDatabase();
    }
  } catch (error) {
    console.error('[Umbrella] Could not read local database; starting with safe defaults.', error);
    database = defaultDb();
  }
  return database;
}

export function getDatabase() { return database; }

export function saveDatabase() {
  try {
    mkdirSync(dataDirectory(), { recursive: true });
    const target = databasePath();
    const temporary = `${target}.tmp`;
    writeFileSync(temporary, JSON.stringify(database, null, 2), 'utf8');
    renameSync(temporary, target);
  } catch (error) {
    console.error('[Umbrella] Could not persist local data.', error);
  }
}

export function getDataDirectory() { return dataDirectory(); }
