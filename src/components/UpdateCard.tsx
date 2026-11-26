import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, RotateCw } from 'lucide-react';
import type { UpdateState } from '../../electron/updates';

function descriptionFor(state: UpdateState | null) {
  if (!state) return 'Lettura dello stato degli aggiornamenti…';
  switch (state.status) {
    case 'disabled':
      return state.unsupportedReason ?? 'Gli aggiornamenti non sono disponibili in questa versione.';
    case 'idle':
      return 'Umbrella controlla le release pubblicate su GitHub e scarica la nuova versione in background.';
    case 'checking':
      return 'Ricerca di una nuova release su GitHub…';
    case 'downloading':
      return state.percent === null ? 'Download in corso…' : `Download in corso: ${state.percent}%`;
    case 'downloaded':
      return `La versione ${state.availableVersion ?? 'nuova'} è pronta. Riavvia per completare l’aggiornamento.`;
    case 'up-to-date':
      return `Umbrella è aggiornato (versione ${state.currentVersion}).`;
    case 'error':
      return 'Controllo degli aggiornamenti non riuscito.';
  }
}

function buttonLabelFor(state: UpdateState | null) {
  if (!state) return 'Controlla aggiornamenti';
  if (state.status === 'downloaded') return 'Riavvia e installa';
  if (state.status === 'checking') return 'Controllo…';
  if (state.status === 'downloading') return 'Download…';
  return 'Controlla aggiornamenti';
}

export default function UpdateCard() {
  const [state, setState] = useState<UpdateState | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    let active = true;
    void window.umbrella.getUpdateState()
      .then((next) => { if (active) setState(next); })
      .catch((error: unknown) => {
        console.error('[Umbrella] Could not read the update state:', error);
        if (active) setFeedback('Non è stato possibile leggere lo stato degli aggiornamenti.');
      });
    const offUpdateState = window.umbrella.onUpdateState((next) => setState(next));
    return () => { active = false; offUpdateState(); };
  }, []);

  const check = useCallback(async () => {
    setBusy(true);
    setFeedback('');
    try {
      setState(await window.umbrella.checkForUpdates());
    } catch (error) {
      console.error('[Umbrella] Update check failed:', error);
      setFeedback('Controllo degli aggiornamenti non riuscito.');
    } finally {
      setBusy(false);
    }
  }, []);

  const install = useCallback(async () => {
    setBusy(true);
    setFeedback('');
    try {
      const started = await window.umbrella.installUpdate();
      if (!started) {
        setFeedback('L’aggiornamento non è ancora pronto.');
        setBusy(false);
      }
    } catch (error) {
      console.error('[Umbrella] Could not start the update installer:', error);
      setFeedback('Impossibile avviare l’installazione.');
      setBusy(false);
    }
  }, []);

  const downloaded = state?.status === 'downloaded';
  const checking = state?.status === 'checking';
  const downloading = state?.status === 'downloading';
  const actionDisabled = !state || busy || checking || downloading || state.status === 'disabled';
  const message = feedback || (state?.status === 'error' ? state.error : '');

  return (
    <section className="settings-card">
      <div className="settings-card-title"><span>Aggiornamenti</span><span>10</span></div>
      <h3>{downloaded ? 'Aggiornamento pronto' : 'Tieni Umbrella al sicuro'}</h3>
      <p>{descriptionFor(state)}</p>
      {downloading && state?.percent !== null && state?.percent !== undefined && <div
        className="download-progress"
        role="progressbar"
        aria-label="Download dell’aggiornamento"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={state.percent}
      ><span style={{ width: `${state.percent}%` }} /></div>}
      <div className="settings-button-row">
        {downloaded
          ? <button className="button-primary" onClick={() => void install()} disabled={busy}>
            <RotateCw size={15} /> {busy ? 'Riavvio…' : buttonLabelFor(state)}
          </button>
          : <button className="button-primary" onClick={() => void check()} disabled={actionDisabled}>
            <RefreshCw size={15} /> {buttonLabelFor(state)}
          </button>}
      </div>
      {message && <small className="setting-note" role="status">{message}</small>}
      <small className="setting-note">
        Versione installata {state?.currentVersion ?? '…'} · aggiornamenti dalle release GitHub. La versione portable va aggiornata manualmente.
      </small>
    </section>
  );
}
