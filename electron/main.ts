import {
  app, BrowserWindow, WebContentsView, ipcMain, session, dialog, shell, nativeTheme, Notification, Menu, screen,
  type DownloadItem, type Session, type MessageBoxOptions
} from 'electron';
import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import fetch from 'cross-fetch';
import { ElectronBlocker } from '@ghostery/adblocker-electron';
import { getDatabase, getDataDirectory, loadDatabase, saveDatabase, type Bookmark, type PersistedTab } from './storage';
import { isSafeWebUrl, resolveNavigation } from './navigation';
import type { AppSettings } from './storage';

app.setAppUserModelId('com.umbrella.browser');

const DEFAULT_PARTITION = 'persist:umbrella';
type Tab = {
  id: string;
  title: string;
  url: string;
  loading: boolean;
  audible: boolean;
  incognito: boolean;
  faviconUrl: string | null;
  view: WebContentsView | null;
};
type DownloadRecord = {
  id: string;
  filename: string;
  url: string;
  receivedBytes: number;
  totalBytes: number;
  state: string;
  paused: boolean;
  savePath: string;
};
type ContentBounds = { x: number; y: number; width: number; height: number; visible: boolean };

let mainWindow: BrowserWindow | null = null;
let extensionPopupWindow: BrowserWindow | null = null;
let extensionPopupId = '';
let database = getDatabase();
let tabs: Tab[] = [];
let activeTabId = '';
let contentBounds: ContentBounds = { x: 58, y: 48, width: 800, height: 600, visible: false };
const recentlyClosed: PersistedTab[] = [];
const downloads = new Map<string, { record: DownloadRecord; item: DownloadItem }>();
const wiredPartitions = new Set<string>();
const activeSessions = new Map<string, Session>();
let adBlocker: ElectronBlocker | null = null;
let adBlockerLoading: Promise<ElectronBlocker> | null = null;
let adBlockReady = false;
let adBlockError: string | null = null;
const pendingPermissionRequests = new Map<string, (allowed: boolean) => void>();

const activeTab = () => tabs.find((tab) => tab.id === activeTabId) ?? null;
const toTabInfo = (tab: Tab) => ({
  id: tab.id, title: tab.title || 'Nuova scheda', url: tab.url,
  isNewTab: !tab.url, loading: tab.loading,
  canGoBack: !!tab.view?.webContents.canGoBack(),
  canGoForward: !!tab.view?.webContents.canGoForward(),
  audible: tab.audible, incognito: tab.incognito, faviconUrl: tab.faviconUrl
});

const currentDownloads = () => [...downloads.values()].map(({ record }) => ({ ...record }));

function getExtensionsInfo() {
  return database.extensions.map(({ id, name, version, enabled, path }) => ({
    id, name, version, enabled, iconDataUrl: getExtensionIconDataUrl(path)
  }));
}

function getExtensionIconDataUrl(extensionDirectory: string): string | undefined {
  try {
    const manifestPath = join(extensionDirectory, 'manifest.json');
    if (!existsSync(manifestPath)) return undefined;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      icons?: Record<string, string>;
      action?: { default_icon?: string | Record<string, string> };
      browser_action?: { default_icon?: string | Record<string, string> };
    };
    const iconDefinitions = [manifest.action?.default_icon, manifest.browser_action?.default_icon, manifest.icons];
    const candidates = iconDefinitions.flatMap((definition) => {
      if (typeof definition === 'string') return [definition];
      if (!definition || typeof definition !== 'object') return [];
      return Object.entries(definition)
        .sort(([left], [right]) => Number(right) - Number(left))
        .map(([, iconPath]) => iconPath);
    });
    const root = realpathSync(extensionDirectory);
    for (const candidate of candidates) {
      if (typeof candidate !== 'string' || isAbsolute(candidate)) continue;
      const requestedPath = resolve(root, candidate);
      if (!existsSync(requestedPath) || !statSync(requestedPath).isFile()) continue;
      const iconPath = realpathSync(requestedPath);
      const relativePath = relative(root, iconPath);
      if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) continue;
      const mimeType = ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' } as Record<string, string>)[extname(iconPath).toLowerCase()];
      if (!mimeType || statSync(iconPath).size > 512 * 1024) continue;
      return `data:${mimeType};base64,${readFileSync(iconPath).toString('base64')}`;
    }
  } catch (error) {
    console.warn('[Umbrella] Could not load an extension icon:', error);
  }
  return undefined;
}

function getWallpaperUrl() {
  const wallpaperPath = database.settings.wallpaperPath;
  return wallpaperPath && existsSync(wallpaperPath) ? pathToFileURL(wallpaperPath).href : null;
}

async function syncAdBlocker() {
  if (!database.settings.adBlockEnabled) {
    if (adBlocker) {
      for (const ses of activeSessions.values()) {
        try { adBlocker.disableBlockingInSession(ses); } catch (error) { console.warn('[Umbrella] Could not disable ad blocking:', error); }
      }
    }
    adBlockReady = false;
    adBlockError = null;
    emitState();
    return;
  }

  try {
    if (!adBlocker) {
      if (!adBlockerLoading) {
        const filterDirectory = join(getDataDirectory(), 'filters');
        mkdirSync(filterDirectory, { recursive: true });
        adBlockerLoading = ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, {
          path: join(filterDirectory, 'adblock-engine.bin'),
          read: (filePath: string) => readFile(filePath),
          write: (filePath: string, data: Uint8Array) => writeFile(filePath, data)
        }).finally(() => { adBlockerLoading = null; });
      }
      adBlocker = await adBlockerLoading;
    }
    // Respect a toggle changed while the filter engine was being loaded.
    if (!database.settings.adBlockEnabled) {
      for (const ses of activeSessions.values()) adBlocker.disableBlockingInSession(ses);
      adBlockReady = false;
      adBlockError = null;
      emitState();
      return;
    }
    for (const ses of activeSessions.values()) adBlocker.enableBlockingInSession(ses);
    adBlockReady = true;
    adBlockError = null;
  } catch (error) {
    adBlockReady = false;
    adBlockError = error instanceof Error ? error.message : 'Impossibile caricare i filtri.';
    console.warn('[Umbrella] Ad blocker could not be initialized:', error);
  }
  emitState();
}

function readExtensionManifest(extensionDirectory: string) {
  const manifestPath = join(extensionDirectory, 'manifest.json');
  if (!existsSync(manifestPath) || !statSync(manifestPath).isFile()) throw new Error('Nella cartella selezionata non è presente manifest.json.');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name?: unknown; version?: unknown; manifest_version?: unknown };
  if (manifest.manifest_version !== 3) throw new Error('Per questa versione sono accettate estensioni Manifest V3.');
  if (typeof manifest.name !== 'string' || !manifest.name.trim() || typeof manifest.version !== 'string') throw new Error('Il manifest dell’estensione non contiene nome e versione validi.');
  return { name: manifest.name.trim(), version: manifest.version };
}

async function restoreInstalledExtensions() {
  const ses = session.fromPartition(DEFAULT_PARTITION, { cache: true });
  let changed = false;
  for (const item of database.extensions) {
    if (!item.enabled) continue;
    try {
      if (!existsSync(item.path)) throw new Error('Cartella estensione non trovata.');
      const loaded = await ses.extensions.loadExtension(item.path);
      item.id = loaded.id;
      item.name = loaded.name || item.name;
      item.version = loaded.version || item.version;
    } catch (error) {
      item.enabled = false;
      changed = true;
      console.warn(`[Umbrella] Extension ${item.name} was not restored:`, error);
    }
  }
  if (changed) saveDatabase();
}

function emitState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('browser:state', {
    tabs: tabs.map(toTabInfo), activeTabId,
    bookmarks: database.bookmarks,
    history: database.history.slice(0, 500),
    downloads: currentDownloads(),
    settings: database.settings,
    wallpaperUrl: getWallpaperUrl(),
    extensions: getExtensionsInfo(),
    adBlockReady,
    adBlockError
  });
}

function persistSession() {
  database.lastSession = tabs
    .filter((tab) => !tab.incognito && tab.url && isSafeWebUrl(tab.url))
    .map((tab) => ({ url: tab.url, title: tab.title }))
    .slice(-30);
  saveDatabase();
}

function updateTab(tab: Tab, patch: Partial<Pick<Tab, 'title' | 'url' | 'loading' | 'audible' | 'faviconUrl'>>) {
  Object.assign(tab, patch);
  emitState();
}

function applyContentViewVisibility() {
  for (const tab of tabs) {
    if (tab.view) tab.view.setVisible(false);
  }
  const current = activeTab();
  if (current?.view && contentBounds.visible && mainWindow && !mainWindow.isMinimized()) {
    current.view.setBounds({
      x: Math.max(0, Math.round(contentBounds.x)),
      y: Math.max(0, Math.round(contentBounds.y)),
      width: Math.max(1, Math.round(contentBounds.width)),
      height: Math.max(1, Math.round(contentBounds.height))
    });
    current.view.setVisible(true);
  }
}

function addHistory(tab: Tab) {
  if (tab.incognito || !isSafeWebUrl(tab.url)) return;
  database.history.unshift({ id: randomUUID(), title: tab.title || tab.url, url: tab.url, visitedAt: Date.now() });
  database.history = database.history.slice(0, 5000);
  saveDatabase();
}

function handleDownload(partitionSession: Session, item: DownloadItem, isPrivate: boolean) {
  const id = randomUUID();
  const record: DownloadRecord = {
    id,
    filename: item.getFilename(),
    url: item.getURL(),
    receivedBytes: item.getReceivedBytes(),
    totalBytes: item.getTotalBytes(),
    state: 'progressing',
    paused: false,
    savePath: item.getSavePath()
  };
  downloads.set(id, { record, item });
  emitState();

  const settings = database.settings;
  if (settings.askDownloadLocation && !isPrivate) {
    const saveChoice = mainWindow && !mainWindow.isDestroyed()
      ? dialog.showSaveDialog(mainWindow, { defaultPath: record.filename })
      : dialog.showSaveDialog({ defaultPath: record.filename });
    void saveChoice.then((choice) => {
      if (choice.canceled || !choice.filePath) item.cancel();
      else item.setSavePath(choice.filePath);
      record.savePath = choice.filePath ?? '';
      emitState();
    }).catch(() => item.cancel());
  }

  item.on('updated', (_event, state) => {
    record.receivedBytes = item.getReceivedBytes();
    record.totalBytes = item.getTotalBytes();
    record.paused = item.isPaused();
    record.savePath = item.getSavePath();
    record.state = state;
    emitState();
  });
  item.once('done', (_event, state) => {
    record.receivedBytes = item.getReceivedBytes();
    record.totalBytes = item.getTotalBytes();
    record.paused = false;
    record.savePath = item.getSavePath();
    record.state = state;
    emitState();
    if (state === 'completed' && !isPrivate && database.settings.downloadNotifications && Notification.isSupported()) {
      new Notification({ title: 'Download completato', body: record.filename }).show();
    }
  });
}

function configureSession(partition: string, isPrivate: boolean) {
  const ses = session.fromPartition(partition, { cache: true });
  activeSessions.set(partition, ses);
  if (wiredPartitions.has(partition)) return ses;
  wiredPartitions.add(partition);
  if (adBlocker && database.settings.adBlockEnabled) {
    try { adBlocker.enableBlockingInSession(ses); } catch (error) { console.warn('[Umbrella] Could not enable ad blocking in session:', error); }
  }

  ses.on('will-download', (_event, item) => handleDownload(ses, item, isPrivate));
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const supported = new Set(['media', 'geolocation', 'notifications', 'clipboard-read', 'midiSysex']);
    if (!supported.has(permission) || isPrivate) return callback(false);
    if (!mainWindow || mainWindow.isDestroyed()) return callback(false);

    const id = randomUUID();
    pendingPermissionRequests.set(id, callback);
    let hostname = details.requestingUrl;
    try { hostname = new URL(details.requestingUrl).hostname || details.requestingUrl; } catch {}
    mainWindow.webContents.send('permissions:request', {
      id,
      permission,
      origin: details.requestingUrl,
      hostname
    });
  });
  return ses;
}

function createPageView(tab: Tab): WebContentsView | null {
  if (!mainWindow || tab.view) return tab.view;
  const partition = tab.incognito ? `umbrella-private-${tab.id}` : DEFAULT_PARTITION;
  const ses = configureSession(partition, tab.incognito);
  const view = new WebContentsView({
    webPreferences: {
      partition,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: true
    }
  });
  tab.view = view;
  mainWindow.contentView.addChildView(view);
  view.setVisible(false);

  const contents = view.webContents;
  contents.setBackgroundThrottling(true);
  contents.setWindowOpenHandler(({ url }) => {
    if (isSafeWebUrl(url)) createTab(url, tab.incognito);
    else if (url.startsWith('mailto:')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (url.startsWith('mailto:')) { event.preventDefault(); void shell.openExternal(url); return; }
    if (!isSafeWebUrl(url) && url !== 'about:blank') event.preventDefault();
  });
  contents.on('will-redirect', (event, url) => {
    if (!isSafeWebUrl(url) && url !== 'about:blank') event.preventDefault();
  });
  contents.on('did-start-loading', () => updateTab(tab, { loading: true }));
  contents.on('did-stop-loading', () => updateTab(tab, { loading: false }));
  contents.on('page-title-updated', (_event, title) => updateTab(tab, { title: title || tab.url }));
  contents.on('page-favicon-updated', (_event, favicons) => updateTab(tab, { faviconUrl: favicons?.[0] ?? null }));
  contents.on('media-started-playing', () => updateTab(tab, { audible: true }));
  contents.on('media-paused', () => updateTab(tab, { audible: false }));
  contents.on('did-navigate', (_event, url) => {
    updateTab(tab, { url, title: contents.getTitle() || url, loading: false });
    addHistory(tab);
    persistSession();
  });
  contents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
    if (isMainFrame) {
      updateTab(tab, { url });
      persistSession();
    }
  });
  contents.on('render-process-gone', () => updateTab(tab, { loading: false }));
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !input.control) return;
    const key = input.key.toLowerCase();
    if (key === 'l') { event.preventDefault(); mainWindow?.webContents.send('ui:focus-address'); }
    else if (key === 't' && input.shift) { event.preventDefault(); const previous = recentlyClosed.shift(); if (previous) createTab(previous.url); }
    else if (key === 't') { event.preventDefault(); createTab(); }
    else if (key === 'w') { event.preventDefault(); closeTab(tab.id); }
    else if (key === 'r') { event.preventDefault(); contents.reload(); }
    else if (key === 'f') { event.preventDefault(); mainWindow?.webContents.send('ui:find'); }
    else if (key === 'tab') { event.preventDefault(); const index = tabs.findIndex((item) => item.id === activeTabId); switchTab(tabs[(index + 1) % tabs.length]?.id ?? activeTabId); }
  });
  void ses;
  return view;
}

function loadTab(tab: Tab) {
  if (!tab.url || tab.view) return;
  const view = createPageView(tab);
  if (!view) return;
  tab.loading = true;
  void view.webContents.loadURL(tab.url).catch((error: unknown) => {
    console.warn('[Umbrella] Navigation failed:', error);
    updateTab(tab, { loading: false });
  });
}

function createTab(url?: string, incognito = false, loadImmediately = true) {
  const tab: Tab = {
    id: randomUUID(), title: url ? url : 'Nuova scheda', url: url ?? '',
    loading: false, audible: false, incognito, faviconUrl: null, view: null
  };
  tabs.push(tab);
  activeTabId = tab.id;
  if (url && loadImmediately) loadTab(tab);
  applyContentViewVisibility();
  emitState();
  persistSession();
  return tab.id;
}

function switchTab(id: string) {
  const tab = tabs.find((item) => item.id === id);
  if (!tab) return;
  activeTabId = id;
  loadTab(tab);
  applyContentViewVisibility();
  emitState();
}

function closeTab(id: string) {
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return;
  const [tab] = tabs.splice(index, 1);
  const wasActive = activeTabId === id;
  if (!tab.incognito && tab.url) recentlyClosed.unshift({ url: tab.url, title: tab.title });
  if (tab.view) {
    // Detach and hide the native view before destroying its WebContents. This avoids
    // stale native surfaces covering the renderer after a tab is removed.
    tab.view.setVisible(false);
    try { mainWindow?.contentView.removeChildView(tab.view); } catch { /* already detached */ }
    const closingContents = tab.view.webContents;
    tab.view = null;
    if (!closingContents.isDestroyed()) closingContents.close({ waitForBeforeUnload: false });
  }
  if (wasActive) activeTabId = tabs[Math.min(index, tabs.length - 1)]?.id ?? '';
  if (!tabs.length) {
    createTab();
    return;
  }
  applyContentViewVisibility();
  emitState();
  persistSession();
}

function navigate(input: string, tabId?: string) {
  let tab = tabs.find((candidate) => candidate.id === tabId) ?? activeTab();
  if (!tab) {
    createTab();
    tab = activeTab();
  }
  if (!tab) return;
  const url = resolveNavigation(input);
  if (!isSafeWebUrl(url)) return;
  if (!tab.view) createPageView(tab);
  tab.url = url;
  tab.title = url;
  tab.loading = true;
  tab.audible = false;
  tab.faviconUrl = null;
  if (tab.id !== activeTabId) activeTabId = tab.id;
  applyContentViewVisibility();
  emitState();
  void tab.view?.webContents.loadURL(url).catch((error) => {
    console.warn('[Umbrella] Navigation failed:', error);
    updateTab(tab!, { loading: false });
  });
  persistSession();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    backgroundColor: '#11131b',
    show: false,
    title: 'Umbrella',
    icon: app.isPackaged ? join(process.resourcesPath, 'umbrella.ico') : join(__dirname, '../../resources/umbrella.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.removeMenu();
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('resize', applyContentViewVisibility);
  mainWindow.on('maximize', applyContentViewVisibility);
  mainWindow.on('unmaximize', applyContentViewVisibility);
  mainWindow.on('close', () => persistSession());
  mainWindow.on('closed', () => { mainWindow = null; });

  if (process.env.ELECTRON_RENDERER_URL) void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));

  if (!tabs.length) {
    const saved = database.settings.restoreSession ? database.lastSession.filter((tab) => isSafeWebUrl(tab.url)) : [];
    if (saved.length) saved.forEach((tab, index) => createTab(tab.url, false, index === saved.length - 1));
    else createTab();
  } else {
    applyContentViewVisibility();
  }
}

function currentTabView() { return activeTab()?.view?.webContents ?? null; }

ipcMain.handle('browser:get-state', () => ({
  tabs: tabs.map(toTabInfo), activeTabId,
  bookmarks: database.bookmarks,
  history: database.history.slice(0, 500),
  downloads: currentDownloads(), settings: database.settings,
  wallpaperUrl: getWallpaperUrl(), extensions: getExtensionsInfo(), adBlockReady, adBlockError
}));
ipcMain.on('browser:set-content-bounds', (_event, bounds: ContentBounds) => {
  if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return;
  contentBounds = { ...bounds, visible: !!bounds.visible };
  applyContentViewVisibility();
});
ipcMain.handle('permissions:respond', (_event, payload: { id?: string; allowed?: boolean }) => {
  if (!payload?.id || typeof payload.allowed !== 'boolean') return false;
  const callback = pendingPermissionRequests.get(payload.id);
  if (!callback) return false;
  pendingPermissionRequests.delete(payload.id);
  callback(payload.allowed);
  return true;
});
ipcMain.handle('browser:navigate', (_event, payload: { input: string; tabId?: string }) => {
  if (typeof payload?.input !== 'string' || payload.input.length > 4096) return false;
  navigate(payload.input, payload.tabId);
  return true;
});
ipcMain.handle('tabs:new', (_event, payload?: { url?: string; incognito?: boolean }) => {
  if (payload?.url && !isSafeWebUrl(resolveNavigation(payload.url))) return null;
  return createTab(payload?.url, !!payload?.incognito);
});
ipcMain.handle('tabs:switch', (_event, id: string) => switchTab(id));
ipcMain.handle('tabs:close', (_event, id: string) => closeTab(id));
ipcMain.handle('tabs:context-menu', (_event, payload: { id: string; x: number; y: number }) => {
  if (!mainWindow || !payload || typeof payload.id !== 'string' || !tabs.some((tab) => tab.id === payload.id)) return false;
  const id = payload.id;
  const menu = Menu.buildFromTemplate([
    { label: 'Nuova scheda', click: () => createTab() },
    { type: 'separator' },
    { label: 'Duplica scheda', click: () => { const tab = tabs.find((item) => item.id === id); if (tab) tab.url ? createTab(tab.url, tab.incognito) : createTab(undefined, tab.incognito); } },
    { label: 'Chiudi scheda', click: () => closeTab(id) },
    { label: 'Chiudi le altre schede', enabled: tabs.length > 1, click: () => { for (const otherId of tabs.filter((tab) => tab.id !== id).map((tab) => tab.id)) closeTab(otherId); switchTab(id); } },
    { type: 'separator' },
    { label: 'Ripristina scheda chiusa', enabled: recentlyClosed.length > 0, click: () => { const previous = recentlyClosed.shift(); if (previous) createTab(previous.url); } }
  ]);
  menu.popup({ window: mainWindow, x: Math.max(0, Math.floor(payload.x)), y: Math.max(0, Math.floor(payload.y)) });
  return true;
});
ipcMain.handle('tabs:duplicate', (_event, id: string) => {
  const tab = tabs.find((candidate) => candidate.id === id);
  if (tab?.url && isSafeWebUrl(tab.url)) return createTab(tab.url, tab.incognito);
  return createTab(undefined, !!tab?.incognito);
});
ipcMain.handle('tabs:restore', () => {
  const previous = recentlyClosed.shift();
  return previous ? createTab(previous.url) : null;
});
ipcMain.handle('tabs:move', (_event, payload: { id: string; targetIndex: number }) => {
  const from = tabs.findIndex((tab) => tab.id === payload?.id);
  if (from < 0 || !Number.isInteger(payload.targetIndex)) return;
  const [tab] = tabs.splice(from, 1);
  tabs.splice(Math.max(0, Math.min(payload.targetIndex, tabs.length)), 0, tab);
  emitState();
});
ipcMain.handle('browser:back', () => { const view = currentTabView(); if (view?.canGoBack()) view.goBack(); });
ipcMain.handle('browser:forward', () => { const view = currentTabView(); if (view?.canGoForward()) view.goForward(); });
ipcMain.handle('browser:reload', () => currentTabView()?.reload());
ipcMain.handle('browser:stop', () => currentTabView()?.stop());
ipcMain.handle('browser:find', (_event, query: string) => {
  if (typeof query === 'string' && query.length < 500) currentTabView()?.findInPage(query);
});
ipcMain.handle('browser:stop-find', () => currentTabView()?.stopFindInPage('clearSelection'));

ipcMain.handle('bookmarks:toggle-current', () => {
  const tab = activeTab();
  if (!tab || !isSafeWebUrl(tab.url) || tab.incognito) return false;
  const existing = database.bookmarks.find((bookmark) => bookmark.url === tab.url);
  if (existing) database.bookmarks = database.bookmarks.filter((bookmark) => bookmark.id !== existing.id);
  else database.bookmarks.unshift({ id: randomUUID(), title: tab.title || tab.url, url: tab.url, createdAt: Date.now() });
  saveDatabase(); emitState(); return true;
});
ipcMain.handle('bookmarks:add', (_event, payload: { title: string; url: string }) => {
  if (!payload || typeof payload.url !== 'string' || !isSafeWebUrl(payload.url)) return false;
  if (!database.bookmarks.some((bookmark) => bookmark.url === payload.url)) {
    database.bookmarks.unshift({ id: randomUUID(), title: String(payload.title || payload.url).slice(0, 160), url: payload.url, createdAt: Date.now() });
    saveDatabase(); emitState();
  }
  return true;
});
ipcMain.handle('bookmarks:remove', (_event, id: string) => {
  database.bookmarks = database.bookmarks.filter((bookmark) => bookmark.id !== id); saveDatabase(); emitState();
});
ipcMain.handle('bookmarks:update', (_event, payload: { id: string; title: string; url: string }) => {
  if (!payload || !isSafeWebUrl(payload.url)) return false;
  const bookmark = database.bookmarks.find((item) => item.id === payload.id);
  if (bookmark) { bookmark.title = String(payload.title).slice(0, 160); bookmark.url = payload.url; saveDatabase(); emitState(); }
  return !!bookmark;
});
ipcMain.handle('history:remove', (_event, id: string) => {
  database.history = database.history.filter((visit) => visit.id !== id); saveDatabase(); emitState();
});
ipcMain.handle('history:clear', () => { database.history = []; saveDatabase(); emitState(); });

ipcMain.handle('downloads:action', (_event, payload: { id: string; action: string }) => {
  const entry = downloads.get(payload?.id);
  if (!entry) return false;
  const { item, record } = entry;
  switch (payload.action) {
    case 'pause': if (!item.isPaused()) item.pause(); break;
    case 'resume': if (item.isPaused() && item.canResume()) item.resume(); break;
    case 'cancel': item.cancel(); break;
    case 'open': if (record.savePath) void shell.openPath(record.savePath); break;
    case 'show': if (record.savePath) shell.showItemInFolder(record.savePath); break;
    default: return false;
  }
  return true;
});

ipcMain.handle('settings:update', async (_event, patch: Partial<AppSettings>) => {
  const allowed: Partial<AppSettings> = {};
  if (patch.theme === 'dark' || patch.theme === 'light' || patch.theme === 'system') allowed.theme = patch.theme;
  if (typeof patch.accent === 'string' && /^#[0-9a-f]{6}$/i.test(patch.accent)) allowed.accent = patch.accent;
  if (typeof patch.restoreSession === 'boolean') allowed.restoreSession = patch.restoreSession;
  if (typeof patch.askDownloadLocation === 'boolean') allowed.askDownloadLocation = patch.askDownloadLocation;
  if (typeof patch.downloadNotifications === 'boolean') allowed.downloadNotifications = patch.downloadNotifications;
  if (typeof patch.adBlockEnabled === 'boolean') allowed.adBlockEnabled = patch.adBlockEnabled;
  database.settings = { ...database.settings, ...allowed };
  saveDatabase();
  if (typeof patch.adBlockEnabled === 'boolean') await syncAdBlocker();
  emitState();
  return database.settings;
});

ipcMain.handle('wallpaper:choose', async () => {
  const openChoice = mainWindow && !mainWindow.isDestroyed()
    ? dialog.showOpenDialog(mainWindow, {
    title: 'Scegli lo sfondo di Umbrella',
    properties: ['openFile'],
    filters: [{ name: 'Immagini', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }]
  })
    : dialog.showOpenDialog({
      title: 'Scegli lo sfondo di Umbrella',
      properties: ['openFile'],
      filters: [{ name: 'Immagini', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }]
    });
  const choice = await openChoice;
  const sourcePath = choice.filePaths[0];
  if (choice.canceled || !sourcePath) return false;
  try {
    const extension = extname(sourcePath).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(extension)) return false;
    const stats = statSync(sourcePath);
    if (!stats.isFile() || stats.size > 30 * 1024 * 1024) {
      const invalidImage = mainWindow && !mainWindow.isDestroyed()
        ? dialog.showMessageBox(mainWindow, { type: 'warning', title: 'Immagine non valida', message: 'Scegli un file immagine inferiore a 30 MB.' })
        : dialog.showMessageBox({ type: 'warning', title: 'Immagine non valida', message: 'Scegli un file immagine inferiore a 30 MB.' });
      await invalidImage;
      return false;
    }
    const wallpaperDirectory = join(getDataDirectory(), 'wallpapers');
    mkdirSync(wallpaperDirectory, { recursive: true });
    const destination = join(wallpaperDirectory, `wallpaper-${randomUUID()}${extension}`);
    copyFileSync(sourcePath, destination);
    database.settings.wallpaperPath = destination;
    saveDatabase();
    emitState();
    return true;
  } catch (error) {
    console.error('[Umbrella] Could not set wallpaper:', error);
    return false;
  }
});
ipcMain.handle('wallpaper:reset', () => {
  database.settings.wallpaperPath = null;
  saveDatabase(); emitState(); return true;
});

ipcMain.handle('extensions:add', async () => {
  const openChoice = mainWindow && !mainWindow.isDestroyed()
    ? dialog.showOpenDialog(mainWindow, {
    title: 'Seleziona la cartella di un’estensione Chrome estratta',
    properties: ['openDirectory']
  })
    : dialog.showOpenDialog({
      title: 'Seleziona la cartella di un’estensione Chrome estratta',
      properties: ['openDirectory']
    });
  const choice = await openChoice;
  if (choice.canceled || !choice.filePaths[0]) return { ok: false, message: 'Installazione annullata.' };
  try {
    const extensionPath = realpathSync(choice.filePaths[0]);
    const manifest = readExtensionManifest(extensionPath);
    const ses = session.fromPartition(DEFAULT_PARTITION, { cache: true });
    const duplicate = database.extensions.find((item) => item.path === extensionPath);
    if (duplicate?.enabled) return { ok: true, message: `${duplicate.name} è già installata.` };
    const confirmOptions: MessageBoxOptions = {
      type: 'warning', title: 'Installa estensione',
      message: `Vuoi installare ${manifest.name}?`,
      detail: 'Le estensioni possono leggere e modificare i dati dei siti in base ai permessi richiesti. Installa solo estensioni di cui ti fidi.',
      buttons: ['Installa', 'Annulla'], defaultId: 1, cancelId: 1, noLink: true
    };
    const confirm = mainWindow && !mainWindow.isDestroyed()
      ? await dialog.showMessageBox(mainWindow, confirmOptions)
      : await dialog.showMessageBox(confirmOptions);
    if (confirm.response !== 0) return { ok: false, message: 'Installazione annullata.' };
    const loaded = await ses.extensions.loadExtension(extensionPath);
    database.extensions = database.extensions.filter((item) => item.path !== extensionPath && item.id !== loaded.id);
    database.extensions.push({ id: loaded.id, name: loaded.name || manifest.name, version: loaded.version || manifest.version, path: extensionPath, enabled: true });
    saveDatabase(); emitState();
    return { ok: true, message: `${loaded.name || manifest.name} è stata aggiunta.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Installazione non riuscita.' };
  }
});
ipcMain.handle('extensions:set-enabled', async (_event, payload: { id: string; enabled: boolean }) => {
  const item = database.extensions.find((entry) => entry.id === payload?.id);
  if (!item || typeof payload.enabled !== 'boolean') return false;
  const ses = session.fromPartition(DEFAULT_PARTITION, { cache: true });
  try {
    if (payload.enabled && !item.enabled) {
      if (!existsSync(item.path)) throw new Error('La cartella dell’estensione non è più disponibile.');
      const loaded = await ses.extensions.loadExtension(item.path);
      item.id = loaded.id; item.name = loaded.name || item.name; item.version = loaded.version || item.version;
    } else if (!payload.enabled && item.enabled) {
      ses.extensions.removeExtension(item.id);
    }
    item.enabled = payload.enabled;
    saveDatabase(); emitState(); return true;
  } catch (error) {
    console.warn('[Umbrella] Could not change extension state:', error);
    return false;
  }
});
ipcMain.handle('extensions:remove', (_event, id: string) => {
  const item = database.extensions.find((entry) => entry.id === id);
  if (!item) return false;
  if (item.enabled) session.fromPartition(DEFAULT_PARTITION, { cache: true }).extensions.removeExtension(item.id);
  database.extensions = database.extensions.filter((entry) => entry.id !== id);
  saveDatabase(); emitState(); return true;
});
ipcMain.handle('extensions:open-popup', async (_event, payload: { id?: string; position?: { right?: number; bottom?: number } }) => {
  const item = database.extensions.find((entry) => entry.id === payload?.id && entry.enabled);
  if (!item || !mainWindow || mainWindow.isDestroyed()) return { ok: false, message: 'Estensione non disponibile.' };

  const ses = session.fromPartition(DEFAULT_PARTITION, { cache: true });
  const extension = ses.extensions.getExtension(item.id);
  if (!extension) return { ok: false, message: 'Estensione non caricata.' };

  const manifest = extension.manifest as {
    action?: { default_popup?: unknown };
    browser_action?: { default_popup?: unknown };
  };
  const popupPath = manifest.action?.default_popup ?? manifest.browser_action?.default_popup;
  if (typeof popupPath !== 'string' || !popupPath.trim()) {
    return { ok: false, message: 'Questa estensione non definisce una finestra popup.' };
  }

  let popupUrl: URL;
  try {
    popupUrl = new URL(popupPath, extension.url);
    const extensionUrl = new URL(extension.url);
    if (popupUrl.protocol !== 'chrome-extension:' || popupUrl.host !== extensionUrl.host) {
      throw new Error('Percorso popup non valido.');
    }
    const root = realpathSync(extension.path);
    const decodedPath = decodeURIComponent(popupUrl.pathname).replace(/^[/\\]+/, '');
    const requestedPath = resolve(root, decodedPath);
    const resolvedPath = realpathSync(requestedPath);
    const relativePath = relative(root, resolvedPath);
    if (!statSync(resolvedPath).isFile() || !relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
      throw new Error('File popup non valido.');
    }
  } catch (error) {
    console.warn(`[Umbrella] Could not open popup for ${item.name}:`, error);
    return { ok: false, message: 'Impossibile aprire il popup dell’estensione.' };
  }

  if (extensionPopupWindow && !extensionPopupWindow.isDestroyed()) {
    if (extensionPopupId === item.id) {
      extensionPopupWindow.close();
      return { ok: true };
    }
    extensionPopupWindow.close();
  }

  const windowBounds = mainWindow.getContentBounds();
  const workArea = screen.getDisplayMatching(mainWindow.getBounds()).workArea;
  const width = Math.min(800, workArea.width);
  const height = Math.min(600, workArea.height);
  const { right, bottom } = payload.position ?? {};
  if (typeof right !== 'number' || !Number.isFinite(right) || typeof bottom !== 'number' || !Number.isFinite(bottom)) {
    return { ok: false, message: 'Posizione popup non valida.' };
  }
  const requestedX = windowBounds.x + right - width;
  const requestedY = windowBounds.y + bottom;
  const x = Math.max(workArea.x, Math.min(requestedX, workArea.x + workArea.width - width));
  const y = Math.max(workArea.y, Math.min(requestedY, workArea.y + workArea.height - height));
  const popup = new BrowserWindow({
    parent: mainWindow,
    x, y, width, height,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      session: ses,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  popup.setMenu(null);
  extensionPopupWindow = popup;
  extensionPopupId = item.id;
  popup.on('closed', () => {
    if (extensionPopupWindow === popup) {
      extensionPopupWindow = null;
      extensionPopupId = '';
    }
  });
  popup.on('blur', () => popup.close());

  try {
    await popup.loadURL(popupUrl.href);
    if (!popup.isDestroyed()) popup.show();
    return { ok: true };
  } catch (error) {
    console.warn(`[Umbrella] Could not load popup for ${item.name}:`, error);
    if (!popup.isDestroyed()) popup.close();
    return { ok: false, message: 'Caricamento del popup non riuscito.' };
  }
});
ipcMain.handle('settings:clear-data', async () => {
  const clearOptions: MessageBoxOptions = {
    type: 'warning', title: 'Elimina dati di navigazione',
    message: 'Vuoi eliminare cookie, cache e dati dei siti?',
    detail: 'Questa operazione non elimina i preferiti. Potrebbe disconnetterti dai siti.',
    buttons: ['Elimina dati', 'Annulla'], defaultId: 1, cancelId: 1
  };
  const answer = mainWindow && !mainWindow.isDestroyed()
    ? await dialog.showMessageBox(mainWindow, clearOptions)
    : await dialog.showMessageBox(clearOptions);
  if (answer.response !== 0) return false;
  await session.fromPartition(DEFAULT_PARTITION).clearStorageData();
  await session.fromPartition(DEFAULT_PARTITION).clearCache();
  return true;
});
ipcMain.handle('bookmarks:export', async () => {
  const saveChoice = mainWindow && !mainWindow.isDestroyed()
    ? dialog.showSaveDialog(mainWindow, {
    title: 'Esporta preferiti', defaultPath: 'umbrella-bookmarks.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
    : dialog.showSaveDialog({
      title: 'Esporta preferiti', defaultPath: 'umbrella-bookmarks.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
  const choice = await saveChoice;
  if (choice.canceled || !choice.filePath) return false;
  writeFileSync(choice.filePath, JSON.stringify(database.bookmarks, null, 2), 'utf8');
  return true;
});
ipcMain.handle('bookmarks:import', async () => {
  const openChoice = mainWindow && !mainWindow.isDestroyed()
    ? dialog.showOpenDialog(mainWindow, {
    title: 'Importa preferiti', properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
    : dialog.showOpenDialog({
      title: 'Importa preferiti', properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
  const choice = await openChoice;
  if (choice.canceled || !choice.filePaths[0]) return false;
  try {
    const data = JSON.parse(readFileSync(choice.filePaths[0], 'utf8')) as Partial<Bookmark[]>;
    if (!Array.isArray(data)) return false;
    const imported = data.filter((item): item is Bookmark => !!item && typeof item.url === 'string' && isSafeWebUrl(item.url));
    const existing = new Set(database.bookmarks.map((item) => item.url));
    for (const item of imported) {
      if (!existing.has(item.url)) database.bookmarks.push({ id: randomUUID(), title: String(item.title || item.url), url: item.url, createdAt: Date.now() });
    }
    saveDatabase(); emitState(); return true;
  } catch { return false; }
});

ipcMain.handle('window:action', (_event, action: string) => {
  if (!mainWindow) return;
  if (action === 'minimize') mainWindow.minimize();
  else if (action === 'maximize') mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  else if (action === 'close') mainWindow.close();
});

app.whenReady().then(async () => {
  database = loadDatabase();
  configureSession(DEFAULT_PARTITION, false);
  await restoreInstalledExtensions();
  createWindow();
  // Do not hold the browser startup while filter lists are downloaded on first run.
  void syncAdBlocker();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  nativeTheme.on('updated', emitState);
});
app.on('before-quit', () => persistSession());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
