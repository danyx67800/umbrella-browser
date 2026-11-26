export type PendingPermissionEntry<T> = { id: string; value: T };

type Entry<T> = { tabId: string; createdAt: number; value: T };

/**
 * Tracks site-permission requests that are waiting for a decision from the UI.
 *
 * Chromium keeps the requesting page blocked until the handler calls back, so a
 * request must never be forgotten: it is either answered, cancelled because its
 * tab navigated away or closed, or expired. The registry never calls the
 * callbacks itself, it only hands the entries back to the caller.
 */
export class PendingPermissionRegistry<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly maxAgeMs: number;

  constructor(maxAgeMs: number) {
    this.maxAgeMs = maxAgeMs;
  }

  get size() {
    return this.entries.size;
  }

  add(id: string, tabId: string, value: T, now = Date.now()) {
    this.entries.set(id, { tabId, createdAt: now, value });
  }

  take(id: string): T | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    this.entries.delete(id);
    return entry.value;
  }

  cancelForTab(tabId: string): PendingPermissionEntry<T>[] {
    return this.removeWhere((entry) => entry.tabId === tabId);
  }

  expire(now = Date.now()): PendingPermissionEntry<T>[] {
    return this.removeWhere((entry) => now - entry.createdAt >= this.maxAgeMs);
  }

  drain(): PendingPermissionEntry<T>[] {
    return this.removeWhere(() => true);
  }

  private removeWhere(predicate: (entry: Entry<T>) => boolean): PendingPermissionEntry<T>[] {
    const removed: PendingPermissionEntry<T>[] = [];
    for (const [id, entry] of this.entries) {
      if (!predicate(entry)) continue;
      removed.push({ id, value: entry.value });
      this.entries.delete(id);
    }
    return removed;
  }
}
