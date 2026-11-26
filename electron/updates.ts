import { rewriteUpdateInfoAssets } from './update-assets.ts';

export type UpdateStatus =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'downloaded'
  | 'up-to-date'
  | 'error';

export type UpdateState = {
  status: UpdateStatus;
  currentVersion: string;
  availableVersion: string | null;
  releaseName: string | null;
  releaseNotes: string | null;
  percent: number | null;
  error: string | null;
  unsupportedReason: string | null;
};

export type UpdateEnvironment = {
  isPackaged: boolean;
  platform: string;
  portable: boolean;
};

/**
 * The subset of electron-updater's AppUpdater used here. Keeping it structural
 * lets the controller be exercised with a fake updater in tests.
 */
export type AutoUpdaterLike = {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(event: string, listener: (...args: never[]) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
};

export function getUnsupportedReason(environment: UpdateEnvironment): string | null {
  if (!environment.isPackaged) {
    return 'Gli aggiornamenti sono disponibili solo nella versione installata.';
  }
  if (environment.platform !== 'win32') {
    return 'Gli aggiornamenti automatici sono disponibili solo su Windows.';
  }
  if (environment.portable) {
    return 'La versione portable non si aggiorna da sola: scarica la nuova release da GitHub.';
  }
  return null;
}

/** electron-updater can return release notes as Markdown or as per-version blocks. */
export function normalizeReleaseNotes(notes: unknown): string | null {
  if (typeof notes === 'string') {
    const trimmed = notes.trim();
    return trimmed ? trimmed.slice(0, 4000) : null;
  }
  if (Array.isArray(notes)) {
    const parts = notes
      .map((entry) => (entry && typeof entry === 'object' && typeof (entry as { note?: unknown }).note === 'string'
        ? (entry as { note: string }).note.trim()
        : ''))
      .filter(Boolean);
    return parts.length ? parts.join('\n\n').slice(0, 4000) : null;
  }
  return null;
}

export function clampPercent(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, Math.round(value)));
}

type UpdateInfoLike = { version?: unknown; releaseName?: unknown; releaseNotes?: unknown };
type UpdateCheckResultLike = {
  isUpdateAvailable?: boolean;
  updateInfo?: UpdateInfoLike & { files?: Array<{ url?: string }> };
};

function readUpdateInfo(info: unknown): Pick<UpdateState, 'availableVersion' | 'releaseName' | 'releaseNotes'> {
  if (!info || typeof info !== 'object') {
    return { availableVersion: null, releaseName: null, releaseNotes: null };
  }
  const record = info as UpdateInfoLike;
  const version = typeof record.version === 'string' && record.version.trim() ? record.version.trim() : null;
  const releaseName = typeof record.releaseName === 'string' && record.releaseName.trim() ? record.releaseName.trim() : null;
  return { availableVersion: version, releaseName, releaseNotes: normalizeReleaseNotes(record.releaseNotes) };
}

export type UpdateControllerOptions = {
  updater: AutoUpdaterLike;
  environment: UpdateEnvironment;
  currentVersion: string;
  /** Lists the assets published in the GitHub release, so an alternative file name can be used. */
  resolveAssetNames?: (version: string) => Promise<string[]>;
  onChange?: (state: UpdateState) => void;
};

export class UpdateController {
  private readonly updater: AutoUpdaterLike;
  private readonly unsupportedReason: string | null;
  private readonly resolveAssetNames: ((version: string) => Promise<string[]>) | null;
  private readonly onChange: (state: UpdateState) => void;
  private state: UpdateState;

  constructor(options: UpdateControllerOptions) {
    this.updater = options.updater;
    this.unsupportedReason = getUnsupportedReason(options.environment);
    this.resolveAssetNames = options.resolveAssetNames ?? null;
    this.onChange = options.onChange ?? (() => {});
    this.state = {
      status: this.unsupportedReason ? 'disabled' : 'idle',
      currentVersion: options.currentVersion,
      availableVersion: null,
      releaseName: null,
      releaseNotes: null,
      percent: null,
      error: null,
      unsupportedReason: this.unsupportedReason
    };
    if (this.unsupportedReason) return;
    // The controller starts the download itself, once the file name from
    // latest.yml has been matched against the assets the release publishes.
    // Installation still waits for a restart the user asks for.
    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = true;
    this.bindUpdater();
  }

  get supported() {
    return !this.unsupportedReason;
  }

  getState(): UpdateState {
    return { ...this.state };
  }

  async check(): Promise<UpdateState> {
    if (!this.supported) return this.getState();
    if (this.state.status === 'checking' || this.state.status === 'downloading') return this.getState();
    this.apply({ status: 'checking', error: null, percent: null });
    try {
      const result = await this.updater.checkForUpdates() as UpdateCheckResultLike | null;
      // electron-updater returns updateInfo even when no update is available.
      if (result?.isUpdateAvailable && result.updateInfo) {
        await this.alignReleaseAssets(result.updateInfo);
        // Fill the version here too, so the state does not depend on the event
        // arriving before the promise resolves.
        this.apply({ status: 'downloading', percent: 0, error: null, ...readUpdateInfo(result.updateInfo) });
        void this.updater.downloadUpdate().catch((error) => this.fail(error));
      }
    } catch (error) {
      this.fail(error);
    }
    return this.getState();
  }

  install(): boolean {
    if (this.state.status !== 'downloaded') return false;
    this.updater.quitAndInstall(false, true);
    return true;
  }

  private async alignReleaseAssets(info: UpdateInfoLike & { files?: Array<{ url?: string }> }) {
    if (!this.resolveAssetNames || typeof info.version !== 'string' || !info.version.trim()) return;
    try {
      const assets = await this.resolveAssetNames(info.version.trim());
      if (!assets.length) return;
      for (const change of rewriteUpdateInfoAssets(info, assets)) {
        console.info('[Umbrella] Using release asset:', change);
      }
    } catch (error) {
      // The canonical name from latest.yml is still what electron-updater tries.
      console.warn('[Umbrella] Could not list the assets of the GitHub release:', error);
    }
  }

  private bindUpdater() {
    this.updater.on('checking-for-update', () => this.apply({ status: 'checking', error: null }));
    this.updater.on('update-available', (info) => {
      this.apply({ status: 'downloading', percent: 0, error: null, ...readUpdateInfo(info) });
    });
    this.updater.on('update-not-available', () => {
      this.apply({ status: 'up-to-date', availableVersion: null, releaseName: null, releaseNotes: null, percent: null });
    });
    this.updater.on('download-progress', (progress) => {
      const percent = clampPercent((progress as { percent?: unknown } | null)?.percent);
      this.apply({ status: 'downloading', percent });
    });
    this.updater.on('update-downloaded', (info) => {
      this.apply({ status: 'downloaded', percent: 100, error: null, ...readUpdateInfo(info) });
    });
    this.updater.on('error', (error) => this.fail(error));
  }

  private fail(error: unknown) {
    const message = error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Aggiornamento non riuscito.';
    this.apply({ status: 'error', percent: null, error: message.slice(0, 300) });
  }

  private apply(patch: Partial<UpdateState>) {
    this.state = { ...this.state, ...patch };
    this.onChange(this.getState());
  }
}
