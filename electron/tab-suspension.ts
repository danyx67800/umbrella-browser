import { isSafeWebUrl } from './navigation.ts';

export type SuspendableTab = {
  id: string;
  url: string;
  incognito: boolean;
  loading: boolean;
  audible: boolean;
  inactiveSince: number | null;
};

export function shouldSuspendTab(tab: SuspendableTab, activeTabId: string, minutes: number, now: number) {
  if (
    minutes <= 0 || tab.id === activeTabId || tab.incognito || tab.loading || tab.audible ||
    tab.inactiveSince === null || !isSafeWebUrl(tab.url)
  ) return false;
  return now - tab.inactiveSince >= minutes * 60_000;
}
