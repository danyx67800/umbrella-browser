import { contextBridge, ipcRenderer } from 'electron';
import type { AppSettings, Bookmark, Visit } from './storage';

export type TabInfo = {
  id: string;
  title: string;
  url: string;
  isNewTab: boolean;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  audible: boolean;
  incognito: boolean;
  faviconUrl: string | null;
};
export type DownloadInfo = {
  id: string;
  filename: string;
  url: string;
  receivedBytes: number;
  totalBytes: number;
  state: string;
  paused: boolean;
  savePath: string;
};
export type ExtensionInfo = { id: string; name: string; version: string; enabled: boolean; iconDataUrl?: string };
export type BrowserState = {
  tabs: TabInfo[];
  activeTabId: string;
  bookmarks: Bookmark[];
  history: Visit[];
  downloads: DownloadInfo[];
  settings: AppSettings;
  wallpaperUrl: string | null;
  extensions: ExtensionInfo[];
  adBlockReady: boolean;
  adBlockError: string | null;
};
export type PermissionRequest = {
  id: string;
  permission: string;
  origin: string;
  hostname: string;
};

const api = {
  getState: () => ipcRenderer.invoke('browser:get-state') as Promise<BrowserState>,
  onState: (callback: (state: BrowserState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: BrowserState) => callback(state);
    ipcRenderer.on('browser:state', handler);
    return () => ipcRenderer.removeListener('browser:state', handler);
  },
  onFocusAddress: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('ui:focus-address', handler);
    return () => ipcRenderer.removeListener('ui:focus-address', handler);
  },
  onFindRequest: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('ui:find', handler);
    return () => ipcRenderer.removeListener('ui:find', handler);
  },
  onPermissionRequest: (callback: (request: PermissionRequest) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, request: PermissionRequest) => callback(request);
    ipcRenderer.on('permissions:request', handler);
    return () => ipcRenderer.removeListener('permissions:request', handler);
  },
  respondToPermission: (id: string, allowed: boolean) =>
    ipcRenderer.invoke('permissions:respond', { id, allowed }) as Promise<boolean>,
  setContentBounds: (bounds: { x: number; y: number; width: number; height: number; visible: boolean }) =>
    ipcRenderer.send('browser:set-content-bounds', bounds),
  navigate: (input: string, tabId?: string) => ipcRenderer.invoke('browser:navigate', { input, tabId }),
  newTab: (url?: string, incognito = false) => ipcRenderer.invoke('tabs:new', { url, incognito }),
  switchTab: (id: string) => ipcRenderer.invoke('tabs:switch', id),
  closeTab: (id: string) => ipcRenderer.invoke('tabs:close', id),
  duplicateTab: (id: string) => ipcRenderer.invoke('tabs:duplicate', id),
  restoreClosedTab: () => ipcRenderer.invoke('tabs:restore'),
  moveTab: (id: string, targetIndex: number) => ipcRenderer.invoke('tabs:move', { id, targetIndex }),
  showTabContextMenu: (id: string, x: number, y: number) => ipcRenderer.invoke('tabs:context-menu', { id, x, y }),
  back: () => ipcRenderer.invoke('browser:back'),
  forward: () => ipcRenderer.invoke('browser:forward'),
  reload: () => ipcRenderer.invoke('browser:reload'),
  stop: () => ipcRenderer.invoke('browser:stop'),
  toggleBookmark: () => ipcRenderer.invoke('bookmarks:toggle-current'),
  addBookmark: (title: string, url: string) => ipcRenderer.invoke('bookmarks:add', { title, url }),
  removeBookmark: (id: string) => ipcRenderer.invoke('bookmarks:remove', id),
  updateBookmark: (id: string, title: string, url: string) => ipcRenderer.invoke('bookmarks:update', { id, title, url }),
  removeHistory: (id: string) => ipcRenderer.invoke('history:remove', id),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  downloadAction: (id: string, action: 'pause' | 'resume' | 'cancel' | 'open' | 'show') => ipcRenderer.invoke('downloads:action', { id, action }),
  updateSettings: (settings: Partial<AppSettings>) => ipcRenderer.invoke('settings:update', settings),
  chooseWallpaper: () => ipcRenderer.invoke('wallpaper:choose') as Promise<boolean>,
  resetWallpaper: () => ipcRenderer.invoke('wallpaper:reset') as Promise<boolean>,
  addExtension: () => ipcRenderer.invoke('extensions:add') as Promise<{ ok: boolean; message: string }>,
  setExtensionEnabled: (id: string, enabled: boolean) => ipcRenderer.invoke('extensions:set-enabled', { id, enabled }) as Promise<boolean>,
  removeExtension: (id: string) => ipcRenderer.invoke('extensions:remove', id) as Promise<boolean>,
  openExtensionPopup: (id: string, position: { right: number; bottom: number }) =>
    ipcRenderer.invoke('extensions:open-popup', { id, position }) as Promise<{ ok: boolean; message?: string }>,
  clearBrowsingData: () => ipcRenderer.invoke('settings:clear-data'),
  exportBookmarks: () => ipcRenderer.invoke('bookmarks:export'),
  importBookmarks: () => ipcRenderer.invoke('bookmarks:import'),
  findInPage: (query: string) => ipcRenderer.invoke('browser:find', query),
  stopFind: () => ipcRenderer.invoke('browser:stop-find'),
  windowAction: (action: 'minimize' | 'maximize' | 'close') => ipcRenderer.invoke('window:action', action)
};

contextBridge.exposeInMainWorld('umbrella', api);
