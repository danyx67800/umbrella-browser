# UMBRELLA

**Umbrella** è una base di browser desktop per Windows, costruita con Electron, Chromium, React e TypeScript. Il marchio usa il logo a ombrello fornito dall'utente.

> **Versione 0.3.1 — build Windows x64 completata.** Type-check, build Electron e generazione dei pacchetti sono riusciti. I test manuali su Windows restano da completare; Umbrella non è presentato come sostituto pronto per Chrome, Edge o Firefox.

## Stack

- Electron 45.4.1 / Chromium 156
- React 19 + TypeScript 7
- Vite 8 + electron-vite 6
- `WebContentsView` per caricare le pagine web come vere viste Chromium, senza iframe
- DuckDuckGo come motore di ricerca predefinito
- `@ghostery/adblocker-electron` per filtrare pubblicità e tracker

## Requisiti e avvio

- Windows 10/11 x64 per la distribuzione richiesta.
- Node.js 24 LTS (o almeno 22.12) e npm 10+.

```bash
npm install
npm run dev
```

Controlli e build:

```bash
npm run typecheck
npm run build
npm run dist
```

`npm run dist` è configurato per generare un installer NSIS e una versione portable x64 in `release/`. La build deve essere eseguita e collaudata su Windows.

## Interfaccia 0.3.1

- Toolbar compatta a tutta larghezza e sidebar verticale comprimibile.
- Il logo fornito è usato nella Nuova scheda, nelle informazioni del browser e nell'icona dell'app. Le schede vuote usano il pittogramma trasparente fornito separatamente su fondo blu.
- Le pagine non attive usano il throttling in background di Chromium; al ripristino viene caricata soltanto la scheda attiva e le altre si aprono al primo accesso. L'orologio aggiorna solo il proprio componente per limitare i render inutili.
- Schede verticali con favicon del sito; per una nuova scheda viene mostrato il logo Umbrella.
- In modalità sidebar compatta, il titolo della scheda e l'indirizzo vengono mostrati dal tooltip nativo del controllo al passaggio del cursore. Nella sidebar espansa il titolo resta visibile.
- Il menu contestuale delle schede è un menu nativo Electron, non un popover HTML sopra la pagina. Questo evita che venga coperto dalla superficie nativa di `WebContentsView`.
- Chiusura scheda: la vista viene nascosta e rimossa dalla finestra prima di chiudere il relativo `WebContents`, poi viene ricalcolata la vista attiva.
- Nuova scheda senza wallpaper anime obbligatorio: resta neutra fino a quando l'utente sceglie un'immagine.
- Orologio, data, ricerca DuckDuckGo, accessi rapidi e accesso alle impostazioni.
- Layout con limiti di larghezza e altezza per ridurre i problemi di clipping e overflow nelle finestre piccole.

## Sfondo personalizzato

Dalle **Impostazioni → Wallpaper → Cambia sfondo** si può scegliere un'immagine JPG, JPEG, PNG, WEBP o GIF fino a 30 MB. Umbrella ne copia una versione nella propria cartella dati e salva il percorso, così lo sfondo resta disponibile dopo il riavvio. **Rimuovi** ripristina lo sfondo neutro. Non viene più impostato automaticamente lo sfondo anime delle schermate di riferimento.

## Schede e favicon

Le favicon vengono ricevute dagli eventi `page-favicon-updated` di Chromium e associate alla scheda corretta. Il nome della pagina è mostrato nella sidebar espansa e nel tooltip nativo al passaggio del cursore sulla scheda compressa. Il menu contestuale nativo include nuova scheda, duplica, chiudi, chiudi le altre e ripristina scheda chiusa. Il clic centrale sulla scheda la chiude.

## Estensioni

Dalla sezione **Estensioni** si può scegliere una cartella di estensione già estratta, con `manifest.json`, installarla, abilitarla/disabilitarla o rimuoverla. Questa versione accetta Manifest V3.

**Limiti tecnici Electron:** non supporta file `.crx`, non implementa tutte le API di Chrome, e non garantisce compatibilità con tutte le estensioni del Chrome Web Store. Le estensioni possono essere caricate solo in sessioni persistenti; non vengono caricate nelle schede private. Umbrella registra il percorso della cartella e ricarica l'estensione a ogni avvio: se la cartella viene spostata o cancellata, l'estensione non potrà essere ripristinata. Installa soltanto estensioni attendibili: il codice dell'estensione può agire sui siti secondo i permessi richiesti.

## Ad blocker integrato

L'ad blocker è attivo per impostazione predefinita e usa `ElectronBlocker` con filtri predefiniti pubblicità + tracking. Al primo avvio scarica il motore di filtri e lo conserva nella cartella dati di Umbrella; le sessioni persistenti e quelle private già aperte ricevono il filtro quando disponibile. L'avvio dell'interfaccia non resta bloccato durante il primo download dei filtri.

La schermata Impostazioni mostra se i filtri sono attivi, in caricamento o non disponibili. Se il primo download fallisce (ad esempio per assenza di rete), la protezione non è attiva finché il motore non viene caricato. In questa versione non ci sono ancora aggiornamenti pianificati dei filtri né eccezioni configurabili per singolo sito.

## Altre funzioni implementate

- Pagine web reali con viste separate e navigazione HTTP/HTTPS.
- Indietro, avanti, ricarica, stop e trova nella pagina (`Ctrl+F`).
- DuckDuckGo per le ricerche dalla barra e dalla Nuova scheda.
- Schede normali persistenti e sessioni private temporanee.
- Preferiti con esportazione/importazione JSON.
- Cronologia con rimozione singole voci e cancellazione completa.
- Download con progresso, pausa/ripresa quando supportate, annullamento, apertura e mostra nella cartella.
- Richieste di permesso per un insieme limitato di autorizzazioni; gli altri permessi sono negati.
- Tema scuro/chiaro/sistema e ripristino schede.

## Persistenza e cartella dati

I dati del browser sono salvati nella directory `userData/Umbrella` di Electron, distinta dai file dell'applicazione. La struttura conserva preferiti, cronologia, impostazioni, wallpaper, percorsi delle estensioni e sessione. Il database viene aggiornato senza sovrascrivere preferiti e cronologia esistenti.

## Tasti rapidi

- `Ctrl+L`: barra degli indirizzi
- `Ctrl+T`: nuova scheda
- `Ctrl+W`: chiudi scheda
- `Ctrl+Shift+T`: ripristina scheda
- `Ctrl+R`: ricarica
- `Ctrl+F`: trova nella pagina
- `Ctrl+Tab`: scheda successiva
- Clic centrale sulla scheda: chiudi scheda
- Tasto destro sulla scheda: menu contestuale

## Verifiche e test ancora necessari

Il type-check, la build Electron e la generazione dei pacchetti Windows x64 sono riusciti. Restano da eseguire i test manuali di navigazione/chiusura schede/favicons/wallpaper/estensioni/ad blocker su Windows 10/11. Sono inoltre da completare controlli granulari dei permessi per sito, aggiornamento filtri, eccezioni ad blocker, test d'integrazione, controllo accessibilità, performance e audit sicurezza.
