import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowUpRight, BookmarkPlus, CirclePlus, Code2, Mail,
  Play, Plus, Search, Send, Settings2, X
} from 'lucide-react';
import type { Bookmark } from '../../electron/storage';

type Props = {
  bookmarks: Bookmark[];
  onSearch: (value: string) => void;
  onOpen: (url: string) => void;
  onAddBookmark: (title: string, url: string) => void;
  onSettings: () => void;
  wallpaperUrl: string | null;
};

const defaults = [
  { title: 'GitHub', url: 'https://github.com/', icon: Code2, tone: 'github' },
  { title: 'Telegram', url: 'https://web.telegram.org/', icon: Send, tone: 'telegram' },
  { title: 'YouTube', url: 'https://youtube.com/', icon: Play, tone: 'youtube' },
  { title: 'Gmail', url: 'https://mail.google.com/', icon: Mail, tone: 'gmail' }
];

function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const time = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  const seconds = new Intl.DateTimeFormat('it-IT', { second: '2-digit' }).format(now);
  const date = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  const greeting = now.getHours() < 12 ? 'BUONGIORNO' : now.getHours() < 18 ? 'BUON POMERIGGIO' : 'BUONA SERATA';

  return (
    <>
      <div className="clock-greeting">{greeting}</div>
      <div className="clock-face" aria-label={`Sono le ${time}`}>
        <span className="clock-time">{time}</span>
        <span className="clock-seconds">{seconds}</span>
      </div>
      <div className="clock-date">{date}</div>
    </>
  );
}

export default function StartPage({ bookmarks, onSearch, onOpen, onAddBookmark, onSettings, wallpaperUrl }: Props) {
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const shortcuts = useMemo(() => bookmarks.slice(0, 4), [bookmarks]);

  const saveShortcut = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !url.trim()) return;
    const normalized = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    onAddBookmark(title.trim(), normalized);
    setTitle(''); setUrl(''); setAdding(false);
  };

  return (
    <main className="start-page">
      <div className={`start-backdrop ${wallpaperUrl ? 'has-custom-wallpaper' : ''}`} style={wallpaperUrl ? { backgroundImage: `url("${wallpaperUrl}")` } : undefined} aria-hidden="true" />
      <div className="start-atmosphere" aria-hidden="true" />

      <div className="start-content">
        <Clock />

        <form className="home-search" onSubmit={(event) => { event.preventDefault(); onSearch(query); }}>
          <Search size={19} strokeWidth={1.8} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cerca sul web..."
            aria-label="Cerca con DuckDuckGo o inserisci un indirizzo"
          />
          <span className="search-provider">DUCKDUCKGO</span>
          <button type="submit" aria-label="Cerca"><ArrowUpRight size={18} /></button>
        </form>

        <section className="shortcuts-section" aria-label="Accessi rapidi">
          <div className="shortcut-grid">
            {shortcuts.length > 0 ? shortcuts.map((item) => (
              <button className="shortcut-card" key={item.id} onClick={() => onOpen(item.url)} title={item.url}>
                <span className="shortcut-icon saved"><Search size={23} strokeWidth={1.7} /></span>
                <span className="shortcut-title">{item.title}</span>
                <ArrowUpRight className="shortcut-open" size={13} />
              </button>
            )) : defaults.map(({ title: shortcutTitle, url: shortcutUrl, icon: Icon, tone }) => (
              <button className="shortcut-card" key={shortcutUrl} onClick={() => onOpen(shortcutUrl)}>
                <span className={`shortcut-icon ${tone}`}><Icon size={25} strokeWidth={1.8} /></span>
                <span className="shortcut-title">{shortcutTitle}</span>
                <ArrowUpRight className="shortcut-open" size={13} />
              </button>
            ))}
            {shortcuts.length < 4 && <button className="shortcut-card add-shortcut" onClick={() => setAdding(true)}>
              <span className="shortcut-icon add"><Plus size={25} strokeWidth={1.6} /></span>
              <span className="shortcut-title">Aggiungi</span>
            </button>}
          </div>
        </section>
      </div>

      <div className="start-footer">
        <span>“Meno rumore. Più spazio alle cose che contano.”</span>
        <small>— UMBRELLA</small>
      </div>

      <button className="start-settings-button" onClick={onSettings} aria-label="Apri impostazioni" title="Personalizza Umbrella">
        <Settings2 size={19} strokeWidth={1.8} />
      </button>

      {adding && <div className="modal-backdrop" onClick={() => setAdding(false)}>
        <form className="dialog-card" onSubmit={saveShortcut} onClick={(event) => event.stopPropagation()}>
          <div className="dialog-head"><div><span className="dialog-kicker">PERSONALIZZA</span><h2>Nuovo accesso rapido</h2></div><button type="button" className="icon-button" onClick={() => setAdding(false)} aria-label="Chiudi"><X size={17} /></button></div>
          <label>Nome<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Es. Il mio sito" required /></label>
          <label>Indirizzo web<input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="esempio.com" required /></label>
          <div className="dialog-actions"><button type="button" className="button-quiet" onClick={() => setAdding(false)}>Annulla</button><button type="submit" className="button-primary"><BookmarkPlus size={15} /> Salva accesso</button></div>
        </form>
      </div>}
    </main>
  );
}
