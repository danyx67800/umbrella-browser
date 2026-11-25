import { useEffect, useState } from 'react';
import { ArrowRight, Check, ExternalLink, FileUp, Monitor, Moon, ShieldCheck, Sun } from 'lucide-react';
import type { AppSettings } from '../../electron/storage';
import type { DefaultBrowserResult } from '../../electron/preload';

type Theme = AppSettings['theme'];
type Props = {
  initialTheme: Theme;
  importFeedback: string;
  onOpenImport: () => void;
  onImportFile: () => Promise<void>;
  onComplete: (theme: Theme) => Promise<void>;
};

const steps = ['Importa dati', 'Browser predefinito', 'Tema'];

export default function Onboarding({ initialTheme, importFeedback, onOpenImport, onImportFile, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [theme, setTheme] = useState(initialTheme);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [defaultStatus, setDefaultStatus] = useState<DefaultBrowserResult | null>(null);

  useEffect(() => {
    let mounted = true;
    void window.umbrella.checkDefaultBrowser().then((result) => {
      if (mounted) setDefaultStatus(result);
    }).catch(() => {
      if (mounted) setDefaultStatus({ registered: false, isDefault: false, settingsOpened: false });
    });
    return () => { mounted = false; };
  }, []);

  const openDefaultSettings = async () => {
    setBusy(true);
    setFeedback('');
    try {
      const result = await window.umbrella.setDefaultBrowser();
      setDefaultStatus(result);
      setFeedback(result.isDefault
        ? 'Umbrella risulta già il browser predefinito.'
        : result.settingsOpened
          ? 'Nelle Impostazioni di Windows cerca Umbrella e selezionalo per HTTP e HTTPS. Poi torna qui e premi “Verifica”.'
          : result.message || 'Non è stato possibile aprire le impostazioni. Puoi cercare Umbrella manualmente nelle app predefinite.');
    } catch (error) {
      console.error('[Umbrella] Could not register default browser:', error);
      setFeedback('Non è stato possibile registrare Umbrella. Prova ad aprire manualmente le app predefinite di Windows.');
    } finally {
      setBusy(false);
    }
  };

  const verifyDefault = async () => {
    setBusy(true);
    try {
      const result = await window.umbrella.checkDefaultBrowser();
      setDefaultStatus(result);
      setFeedback(result.isDefault
        ? 'Perfetto: Umbrella è il browser predefinito.'
        : 'Windows non ha ancora assegnato entrambi i protocolli a Umbrella. Apri le impostazioni e seleziona HTTP e HTTPS.');
    } catch {
      setFeedback('Non è stato possibile verificare lo stato del browser predefinito.');
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    try {
      await onComplete(theme);
    } catch (error) {
      console.error('[Umbrella] Could not complete first-run setup:', error);
      setFeedback('Non è stato possibile salvare le impostazioni. Riprova.');
      setBusy(false);
    }
  };

  return (
    <div className="onboarding-backdrop">
      <section className="onboarding-card" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        <div className="onboarding-brand"><span className="onboarding-mark"><img src="./assets/umbrella-mark.png" alt="" /></span><span>UMBRELLA</span><span className="onboarding-brand-status" /></div>
        <p className="onboarding-kicker">CONFIGURAZIONE INIZIALE</p>
        <h1 id="onboarding-title">{step === 0 ? 'Porta i tuoi dati su Umbrella' : step === 1 ? 'Scegli il browser predefinito' : 'Dai il tuo stile a Umbrella'}</h1>
        <p className="onboarding-description">
          {step === 0
            ? 'Importa i tuoi preferiti e la cronologia dai browser già presenti sul tuo PC. Puoi farlo anche in seguito dalle Impostazioni.'
            : step === 1
              ? 'Registra Umbrella tra le app browser disponibili. Windows ti chiederà di confermare la scelta: nessuna app può cambiarla al posto tuo.'
              : 'Scegli l’aspetto dell’interfaccia e delle ricerche DuckDuckGo.'}
        </p>

        <div className="onboarding-steps" aria-label={`Passaggio ${step + 1} di ${steps.length}`}>
          {steps.map((label, index) => (
            <div className={`onboarding-step ${index === step ? 'active' : index < step ? 'done' : ''}`} key={label}>
              <span>{index < step ? <Check size={12} /> : index + 1}</span>{label}
            </div>
          ))}
        </div>

        {step === 0 && <div className="onboarding-content">
          <div className="onboarding-feature-icon"><FileUp size={20} /></div>
          <h2>Importa da qualsiasi browser supportato</h2>
          <p>Umbrella cerca i profili presenti sul PC: Chrome, Edge, Firefox, Brave, Opera, Opera GX, Vivaldi, Yandex, Chromium e altri profili compatibili.</p>
          <button className="button-primary onboarding-action" onClick={onOpenImport} disabled={busy}>
            <FileUp size={15} /> Importa dati da un browser
          </button>
          {importFeedback && <p className="onboarding-import-success" role="status">{importFeedback}</p>}
          <small>Puoi trasferire preferiti e cronologia. Password, cookie e sessioni non vengono copiati.</small>
          <button className="onboarding-file-link" onClick={() => void onImportFile()} disabled={busy}>Importa un file HTML/JSON invece</button>
        </div>}

        {step === 1 && <div className="onboarding-content">
          <div className={`onboarding-feature-icon ${defaultStatus?.isDefault ? 'is-success' : ''}`}>
            {defaultStatus?.isDefault ? <Check size={20} /> : <ExternalLink size={20} />}
          </div>
          <h2>{defaultStatus?.isDefault ? 'Umbrella è già predefinito' : 'Apri i link con Umbrella'}</h2>
          <p>{defaultStatus?.isDefault
            ? 'I link HTTP e HTTPS del sistema vengono già aperti da Umbrella.'
            : 'Faremo comparire Umbrella nella pagina delle app predefinite di Windows. Nella schermata che si apre seleziona Umbrella e assegna HTTP e HTTPS.'}</p>
          <button className="button-primary onboarding-action" onClick={() => void openDefaultSettings()} disabled={busy || defaultStatus?.isDefault}>
            <ExternalLink size={15} /> {busy ? 'Apertura…' : 'Apri impostazioni Windows'}
          </button>
          <button className="button-quiet onboarding-verify" onClick={() => void verifyDefault()} disabled={busy}>
            <ShieldCheck size={14} /> Verifica browser predefinito
          </button>
          <small>Windows mantiene il controllo dell'impostazione predefinita per proteggere le tue preferenze.</small>
        </div>}

        {step === 2 && <div className="onboarding-content">
          <div className="onboarding-theme-options">
            {([
              { value: 'light', label: 'Chiaro', detail: 'Bianco', Icon: Sun },
              { value: 'dark', label: 'Scuro', detail: 'Notte', Icon: Moon },
              { value: 'system', label: 'Sistema', detail: 'Segue Windows', Icon: Monitor }
            ] as const).map(({ value, label, detail, Icon }) => (
              <button key={value} className={`onboarding-theme ${theme === value ? 'selected' : ''}`} onClick={() => setTheme(value)}>
                <Icon size={18} /><strong>{label}</strong><small>{detail}</small>
                {theme === value && <Check size={14} />}
              </button>
            ))}
          </div>
          <p className="onboarding-theme-note">Potrai cambiare queste preferenze in qualsiasi momento dalle impostazioni.</p>
        </div>}

        {feedback && <p className="onboarding-feedback" role="status">{feedback}</p>}

        <div className="onboarding-footer">
          {step < 2
            ? <button className="onboarding-skip" disabled={busy} onClick={() => { setFeedback(''); setStep((current) => current + 1); }}>
              {step === 0 ? 'Configura più tardi' : 'Continua senza cambiare'}
            </button>
            : <button className="onboarding-skip" disabled={busy} onClick={() => { setFeedback(''); setStep(1); }}>
              Indietro
            </button>}
          {step < 2
            ? <button className="button-primary" disabled={busy} onClick={() => { setFeedback(''); setStep((current) => current + 1); }}>Continua <ArrowRight size={14} /></button>
            : <button className="button-primary" disabled={busy} onClick={() => void finish()}>{busy ? 'Salvataggio…' : 'Inizia a navigare'} <ArrowRight size={14} /></button>}
        </div>
      </section>
    </div>
  );
}
