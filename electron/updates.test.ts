import assert from 'node:assert/strict';
import test from 'node:test';
import {
  UpdateController,
  clampPercent,
  getUnsupportedReason,
  normalizeReleaseNotes,
  type AutoUpdaterLike,
  type UpdateEnvironment,
  type UpdateState
} from './updates.ts';

type FakeResult = {
  isUpdateAvailable: boolean;
  updateInfo?: { version?: string; files?: Array<{ url?: string }> };
};

class FakeUpdater {
  autoDownload = false;
  autoInstallOnAppQuit = false;
  checkCalls = 0;
  downloadCalls = 0;
  checkError: unknown = null;
  downloadError: unknown = null;
  installCalls: Array<{ isSilent?: boolean; isForceRunAfter?: boolean }> = [];
  nextResult: FakeResult | null = { isUpdateAvailable: false, updateInfo: { version: '0.4.4' } };
  lastDownloadUrls: string[] = [];
  private readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  on(event: string, listener: (...args: unknown[]) => void) {
    const current = this.listeners.get(event) ?? [];
    current.push(listener);
    this.listeners.set(event, current);
    return this;
  }

  emit(event: string, ...args: unknown[]) {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }

  async checkForUpdates() {
    this.checkCalls += 1;
    if (this.checkError) throw this.checkError;
    return this.nextResult;
  }

  async downloadUpdate() {
    this.downloadCalls += 1;
    this.lastDownloadUrls = (this.nextResult?.updateInfo?.files ?? []).map((file) => file.url ?? '');
    if (this.downloadError) throw this.downloadError;
    return [];
  }

  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean) {
    this.installCalls.push({ isSilent, isForceRunAfter });
  }
}

const environment = (overrides: Partial<UpdateEnvironment> = {}): UpdateEnvironment => ({
  isPackaged: true,
  platform: 'win32',
  portable: false,
  ...overrides
});

function createController(options: {
  environment?: UpdateEnvironment;
  currentVersion?: string;
  resolveAssetNames?: (version: string) => Promise<string[]>;
} = {}) {
  const updater = new FakeUpdater();
  const changes: UpdateState[] = [];
  const controller = new UpdateController({
    updater: updater as unknown as AutoUpdaterLike,
    environment: options.environment ?? environment(),
    currentVersion: options.currentVersion ?? '0.4.4',
    resolveAssetNames: options.resolveAssetNames,
    onChange: (state) => changes.push(state)
  });
  return { updater, controller, changes };
}

test('disables updates in development, portable and non-Windows builds', () => {
  assert.match(getUnsupportedReason(environment({ isPackaged: false })) ?? '', /versione installata/);
  assert.match(getUnsupportedReason(environment({ portable: true })) ?? '', /portable/);
  assert.match(getUnsupportedReason(environment({ platform: 'darwin' })) ?? '', /Windows/);
  assert.equal(getUnsupportedReason(environment()), null);
});

test('does not contact the updater when updates are unsupported', async () => {
  const { updater, controller } = createController({ environment: environment({ isPackaged: false }) });

  assert.equal(controller.getState().status, 'disabled');
  assert.equal(controller.supported, false);
  await controller.check();

  assert.equal(updater.checkCalls, 0);
  assert.equal(controller.install(), false);
});

test('downloads only on request and installs on quit in a packaged Windows build', () => {
  const { updater, controller } = createController();

  assert.equal(controller.getState().status, 'idle');
  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, true);
});

test('follows a release from check to install', async () => {
  const { updater, controller } = createController();

  await controller.check();
  assert.equal(updater.checkCalls, 1);
  assert.equal(controller.getState().status, 'checking');

  updater.emit('update-available', { version: '0.5.0', releaseName: 'Umbrella 0.5.0' });
  let state = controller.getState();
  assert.equal(state.status, 'downloading');
  assert.equal(state.availableVersion, '0.5.0');
  assert.equal(state.releaseName, 'Umbrella 0.5.0');
  assert.equal(state.percent, 0);

  updater.emit('download-progress', { percent: 42.6 });
  assert.equal(controller.getState().percent, 43);

  updater.emit('update-downloaded', { version: '0.5.0' });
  state = controller.getState();
  assert.equal(state.status, 'downloaded');
  assert.equal(state.percent, 100);

  assert.equal(controller.install(), true);
  assert.deepEqual(updater.installCalls, [{ isSilent: false, isForceRunAfter: true }]);
});

test('reports when no update is available', async () => {
  const { updater, controller } = createController();

  await controller.check();
  // The real updater emits its result after checkForUpdates() has been called.
  updater.emit('update-not-available', { version: '0.4.4' });

  assert.equal(controller.getState().status, 'up-to-date');
  assert.equal(controller.getState().availableVersion, null);
});

test('downloads the asset the release publishes under the dotted name', async () => {
  const requested: string[] = [];
  const { updater, controller } = createController({
    resolveAssetNames: async (version) => {
      requested.push(version);
      return ['Umbrella.setup.0.5.0.exe', 'Umbrella.setup.0.5.0.exe.blockmap'];
    }
  });
  updater.nextResult = {
    isUpdateAvailable: true,
    updateInfo: { version: '0.5.0', files: [{ url: 'Umbrella-Setup-0.5.0.exe' }] }
  };

  await controller.check();

  assert.deepEqual(requested, ['0.5.0']);
  assert.equal(updater.downloadCalls, 1);
  assert.deepEqual(updater.lastDownloadUrls, ['Umbrella.setup.0.5.0.exe']);
  assert.equal(controller.getState().status, 'downloading');
});

test('falls back to the name from latest.yml when the release cannot be listed', async () => {
  const { updater, controller } = createController({
    resolveAssetNames: async () => { throw new Error('GitHub non raggiungibile.'); }
  });
  updater.nextResult = {
    isUpdateAvailable: true,
    updateInfo: { version: '0.5.0', files: [{ url: 'Umbrella-Setup-0.5.0.exe' }] }
  };

  await controller.check();

  assert.equal(updater.downloadCalls, 1);
  assert.deepEqual(updater.lastDownloadUrls, ['Umbrella-Setup-0.5.0.exe']);
});

test('keeps working when the release lists no assets at all', async () => {
  const { updater, controller } = createController({ resolveAssetNames: async () => [] });
  updater.nextResult = {
    isUpdateAvailable: true,
    updateInfo: { version: '0.5.0', files: [{ url: 'Umbrella-Setup-0.5.0.exe' }] }
  };

  await controller.check();

  assert.equal(updater.downloadCalls, 1);
  assert.deepEqual(updater.lastDownloadUrls, ['Umbrella-Setup-0.5.0.exe']);
});

test('does not download when the check reports no update', async () => {
  const { updater, controller } = createController();
  updater.nextResult = { isUpdateAvailable: false, updateInfo: { version: '0.4.4' } };

  await controller.check();

  assert.equal(updater.downloadCalls, 0);
});

test('does not download when the check returns nothing', async () => {
  const { updater, controller } = createController();
  updater.nextResult = null;

  await controller.check();

  assert.equal(updater.downloadCalls, 0);
  assert.equal(controller.getState().status, 'checking');
});

test('surfaces updater failures and allows a retry', async () => {
  const { updater, controller } = createController();

  updater.checkError = new Error('Impossibile raggiungere GitHub.');
  await controller.check();
  assert.equal(controller.getState().status, 'error');
  assert.match(controller.getState().error ?? '', /GitHub/);

  updater.checkError = null;
  await controller.check();
  assert.equal(controller.getState().status, 'checking');
  assert.equal(updater.checkCalls, 2);
});

test('reports a download failure without losing the available version', async () => {
  const { updater, controller } = createController();
  updater.nextResult = {
    isUpdateAvailable: true,
    updateInfo: { version: '0.5.0', files: [{ url: 'Umbrella-Setup-0.5.0.exe' }] }
  };
  updater.downloadError = new Error('Download interrotto.');

  await controller.check();
  await new Promise((resolve) => setImmediate(resolve));

  const state = controller.getState();
  assert.equal(state.status, 'error');
  assert.equal(state.availableVersion, '0.5.0');
  assert.equal(state.error, 'Download interrotto.');
});

test('does not install before the update has been downloaded', () => {
  const { updater, controller } = createController();

  updater.emit('update-available', { version: '0.5.0' });

  assert.equal(controller.install(), false);
  assert.deepEqual(updater.installCalls, []);
});

test('normalizes release notes from Markdown or per-version blocks', () => {
  assert.equal(normalizeReleaseNotes('  Note **nuove**  '), 'Note **nuove**');
  assert.equal(normalizeReleaseNotes([{ version: '0.5.0', note: 'Prima nota' }, { version: '0.4.4', note: 'Seconda nota' }]), 'Prima nota\n\nSeconda nota');
  assert.equal(normalizeReleaseNotes([{ version: '0.5.0' }]), null);
  assert.equal(normalizeReleaseNotes(null), null);
  assert.equal(normalizeReleaseNotes(42), null);
});

test('clamps download percentages to the 0-100 range', () => {
  assert.equal(clampPercent(41.4), 41);
  assert.equal(clampPercent(-5), 0);
  assert.equal(clampPercent(150), 100);
  assert.equal(clampPercent(Number.NaN), null);
  assert.equal(clampPercent('42'), null);
});

test('hands copies of the state to listeners', async () => {
  const { controller, changes } = createController();

  await controller.check();
  changes[0].status = 'downloaded';

  assert.equal(controller.getState().status, 'checking');
});
