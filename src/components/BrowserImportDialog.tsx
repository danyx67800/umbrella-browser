import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Bookmark, Check, Clock3, FileUp, FolderOpen, Globe2,
  LoaderCircle, RefreshCw, ShieldCheck, X
} from 'lucide-react';
import type { BrowserImportResult, ImportBrowserInfo } from '../../electron/preload';

type Props = { onClose: () => void; onImported?: (result: BrowserImportResult) => void };

const iconColor = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes('chrome')) return 'browser-brand chrome';
  if (lower.includes('edge')) return 'browser-brand edge';
  if (lower.includes('firefox')) return 'browser-brand firefox';
  if (lower.includes('brave')) return 'browser-brand brave';
  if (lower.includes('opera')) return 'browser-brand opera';
  if (lower.includes('vivaldi')) return 'browser-brand vivaldi';
  if (lower.includes('yandex')) return 'browser-brand yandex';
  if (lower.includes('waterfox')) return 'browser-brand waterfox';
  if (lower.includes('librewolf')) return 'browser-brand librewolf';
  return 'browser-brand generic';
};

const initials = (name: string) => {
  const normalized = name.replace(/[^a-z0-9 ]/gi, ' ').trim();
  if (normalized.toLowerCase().startsWith('microsoft edge')) return 'E';
  if (normalized.toLowerCase().startsWith('google chrome')) return 'C';
  return normalized.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'B';
};

export default function BrowserImportDialog({ onClose, onImported }: Props) {
  const [browsers, setBrowsers] = useState<ImportBrowserInfo[]>([]);
  const [selectedBrowserId, setSelectedBrowserId] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [includeBookmarks, setIncludeBookmarks] = useState(true);
  const [includeHistory, setIncludeHistory] = useState(true);
  const [busy, setBusy] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<BrowserImportResult | null>(null);
  const [fileFeedback, setFileFeedback] = useState('');

  const selectedBrowser = useMemo(
    () => browsers.find((browser) => browser.id === selectedBrowserId) ?? null,
    [browsers, selectedBrowserId]
  );
  const selectedProfile = useMemo(
    () => selectedBrowser?.profiles.find((profile) => profile.id === selectedProfileId) ?? selectedBrowser?.profiles[0] ?? null,
    [selectedBrowser, selectedProfileId]
  );

  const scan = async (quiet = false) => {
    if (quiet) setScanning(true); else setBusy(true);
    setResult(null);
    setFileFeedback('');
    try {
      const found = await window.umbrella.scanImportSources();
      setBrowsers(found);
      setSelectedBrowserId((current) => found.some((browser) => browser.id === current) ? current : '');
      setSelectedProfileId('');
    } catch (error) {
      console.error('[Umbrella] Browser discovery failed:', error);
      setFileFeedback('Non è stato possibile analizzare i profili browser di questo PC.');
    } finally {
      setBusy(false);
      setScanning(false);
    }
  };

  useEffect(() => { void scan(); }, []);

  const chooseBrowser = (browser: ImportBrowserInfo) => {
    setSelectedBrowserId(browser.id);
    const profile = browser.profiles[0];
    setSelectedProfileId(profile?.id ?? '');
    setIncludeBookmarks(!!profile?.bookmarksAvailable);
    setIncludeHistory(!!profile?.historyAvailable);
    setResult(null);
  };

  const importSelected = async () => {
    if (!selectedBrowser || !selectedProfile || (!includeBookmarks && !includeHistory)) return;
    setBusy(true);
    setResult(null);
    try {
      const response = await window.umbrella.importBrowserProfile(
        selectedBrowser.id,
        selectedProfile.id,
        { bookmarks: includeBookmarks, history: includeHistory }
      );
      setResult(response);
      onImported?.(response);
    } catch (error) {
      console.error('[Umbrella] Browser data import failed:', error);
      setResult({
        ok: false, bookmarksImported: 0, historyImported: 0,
        message: 'Importazione non riuscita. Riprova oppure esporta i preferiti dal vecchio browser.',
        warnings: []
      });
    } finally {
      setBusy(false);
    }
  };

  const chooseCustomFolder = async () => {
    setBusy(true);
    setFileFeedback('');
    try {
      const customBrowser = await window.umbrella.chooseCustomImportSource();
      if (!customBrowser) return;
      setBrowsers((current) => [...current.filter((browser) => browser.id !== customBrowser.id), customBrowser]);
      chooseBrowser(customBrowser);
    } catch (error) {
      console.error('[Umbrella] Custom browser profile selection failed:', error);
      setFileFeedback(error instanceof Error ? error.message : 'La cartella selezionata non contiene un profilo supportato.');
    } finally {
      setBusy(false);
    }
  };

  const importFile = async () => {
    setBusy(true);
    setFileFeedback('');
    try {
      const response = await window.umbrella.importBookmarks();
      setFileFeedback(response.message);
      onImported?.({ ok: response.ok, bookmarksImported: response.count, historyImported: 0, message: response.message, warnings: [] });
    } catch (error) {
      console.error('[Umbrella] Manual bookmark import failed:', error);
      setFileFeedback('Impossibile importare il file selezionato.');
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    if (result) { setResult(null); return; }
    setSelectedBrowserId('');
    setSelectedProfileId('');
  };

  return (
    <div className="browser-import-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section className="browser-import-dialog" role="dialog" aria-modal="true" aria-labelledby="browser-import-title">
        <header className="browser-import-header">
          <div className="browser-import-brand">
            <span className="browser-import-brand-mark"><img src="./assets/umbrella-mark.png" alt="" /></span>
            <span><strong>UMBRELLA</strong><small>TRASFERIMENTO DATI</small></span>
          </div>
          <button className="icon-button" onClick={onClose} disabled={busy} aria-label="Chiudi importazione"><X size={17} /></button>
        </header>

        <div className="browser-import-heading">
          <span className="browser-import-eyebrow">IMPORTA I TUOI DATI</span>
          <h2 id="browser-import-title">{result ? (result.ok ? 'Trasferimento completato' : 'Importazione non completata') : selectedBrowser ? 'Scegli cosa trasferire' : 'Da quale browser arrivi?'}</h2>
          <p>{result
            ? 'I dati importati sono stati aggiunti al tuo profilo Umbrella. Quelli già presenti non vengono duplicati.'
            : selectedBrowser
              ? `Hai selezionato ${selectedBrowser.name}. Puoi importare da uno dei suoi profili presenti sul PC.`
              : 'Abbiamo cercato i profili browser disponibili su questo PC. Scegli quello da cui vuoi importare.'}</p>
        </div>

        {!result && !selectedBrowser && <div className="browser-import-list-area">
          <div className="browser-import-list-label">
            <span>{busy ? 'RICERCA DEI BROWSER…' : `${browsers.length} BROWSER TROVATI`}</span>
            <button className="browser-import-refresh" onClick={() => void scan(true)} disabled={busy || scanning}>
              {scanning ? <LoaderCircle size={13} className="spin" /> : <RefreshCw size={13} />} Aggiorna
            </button>
          </div>
          {busy ? <div className="browser-import-loading"><LoaderCircle size={20} className="spin" /><span>Controllo dei profili installati…</span></div>
            : browsers.length ? <div className="browser-import-grid">
              {browsers.map((browser) => {
                const bookmarkProfiles = browser.profiles.filter((profile) => profile.bookmarksAvailable).length;
                const historyProfiles = browser.profiles.filter((profile) => profile.historyAvailable).length;
                return <button key={browser.id} className="browser-import-option" onClick={() => chooseBrowser(browser)}>
                  <span className={iconColor(browser.name)}>{initials(browser.name)}</span>
                  <span className="browser-import-option-copy">
                    <strong>{browser.name}</strong>
                    <small>{browser.profiles.length} {browser.profiles.length === 1 ? 'profilo' : 'profili'} · {browser.engine}</small>
                    <small className="browser-import-support">{bookmarkProfiles > 0 ? 'Preferiti' : ''}{bookmarkProfiles && historyProfiles ? ' · ' : ''}{historyProfiles > 0 ? 'Cronologia' : ''}</small>
                  </span>
                  <ArrowRight size={15} />
                </button>;
              })}
            </div> : <div className="browser-import-empty">
              <span><Globe2 size={23} /></span>
              <strong>Non abbiamo trovato profili browser importabili</strong>
              <p>Puoi comunque importare un file HTML dei preferiti esportato dal tuo vecchio browser.</p>
            </div>}
          <div className="browser-import-manual">
            <div><strong>Il tuo browser non compare?</strong><small>Seleziona la cartella del profilo Chromium/Firefox oppure importa i preferiti da un file HTML/JSON.</small></div>
            <div className="browser-import-manual-actions">
              <button className="button-quiet" onClick={() => void chooseCustomFolder()} disabled={busy}><FolderOpen size={14} /> Cerca cartella</button>
              <button className="button-quiet" onClick={() => void importFile()} disabled={busy}><FileUp size={14} /> Importa file</button>
            </div>
          </div>
          {fileFeedback && <p className="browser-import-feedback" role="status">{fileFeedback}</p>}
        </div>}

        {!result && selectedBrowser && selectedProfile && <div className="browser-import-details">
          <button className="browser-import-back" onClick={back}><ArrowLeft size={14} /> Cambia browser</button>
          <div className="browser-import-selected">
            <span className={iconColor(selectedBrowser.name)}>{initials(selectedBrowser.name)}</span>
            <div><strong>{selectedBrowser.name}</strong><small>{selectedBrowser.engine} · {selectedBrowser.profiles.length} profili rilevati</small></div>
          </div>
          <label className="browser-import-label" htmlFor="browser-import-profile">Profilo da importare</label>
          <select id="browser-import-profile" value={selectedProfile.id} onChange={(event) => {
            const profile = selectedBrowser.profiles.find((item) => item.id === event.target.value);
            setSelectedProfileId(event.target.value);
            setIncludeBookmarks(!!profile?.bookmarksAvailable);
            setIncludeHistory(!!profile?.historyAvailable);
          }}>
            {selectedBrowser.profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.label}</option>
            ))}
          </select>
          <div className="browser-import-data-label">SCEGLI I DATI DA TRASFERIRE</div>
          <label className={`browser-import-data-option ${!selectedProfile.bookmarksAvailable ? 'disabled' : ''}`}>
            <span className="browser-import-data-icon"><Bookmark size={16} /></span>
            <span><strong>Preferiti</strong><small>Segnalibri e cartelle salvate</small></span>
            <input type="checkbox" checked={includeBookmarks} disabled={!selectedProfile.bookmarksAvailable || busy} onChange={(event) => setIncludeBookmarks(event.target.checked)} />
            <i />
          </label>
          <label className={`browser-import-data-option ${!selectedProfile.historyAvailable ? 'disabled' : ''}`}>
            <span className="browser-import-data-icon"><Clock3 size={16} /></span>
            <span><strong>Cronologia</strong><small>Siti visitati e date delle visite</small></span>
            <input type="checkbox" checked={includeHistory} disabled={!selectedProfile.historyAvailable || busy} onChange={(event) => setIncludeHistory(event.target.checked)} />
            <i />
          </label>
          <div className="browser-import-private-note">
            <ShieldCheck size={15} />
            <span>La lettura viene eseguita localmente. Password, cookie e sessioni non vengono copiati: possono contenere credenziali protette dal sistema operativo.</span>
          </div>
          {fileFeedback && <p className="browser-import-feedback" role="status">{fileFeedback}</p>}
        </div>}

        {result && <div className="browser-import-result">
          <div className={`browser-import-result-icon ${result.ok ? 'success' : 'warning'}`}>
            {result.ok ? <Check size={22} /> : <X size={22} />}
          </div>
          <strong>{result.message}</strong>
          <div className="browser-import-stats">
            <span><Bookmark size={15} /><b>{result.bookmarksImported}</b><small>Preferiti</small></span>
            <span><Clock3 size={15} /><b>{result.historyImported}</b><small>Cronologia</small></span>
          </div>
          {result.warnings.length > 0 && <div className="browser-import-warnings">{result.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
        </div>}

        <footer className="browser-import-footer">
          {result
            ? <button className="button-primary" onClick={onClose}>Fatto <Check size={15} /></button>
            : selectedBrowser
              ? <>
                <button className="button-quiet" disabled={busy} onClick={back}>Indietro</button>
                <button className="button-primary" disabled={busy || (!includeBookmarks && !includeHistory)} onClick={() => void importSelected()}>
                  {busy ? <><LoaderCircle size={15} className="spin" /> Importazione…</> : <>Importa selezionati <ArrowRight size={15} /></>}
                </button>
              </>
              : <button className="button-primary" onClick={onClose}>Continua <ArrowRight size={15} /></button>}
        </footer>
      </section>
    </div>
  );
}
