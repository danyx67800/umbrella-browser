# Note di sicurezza — UMBRELLA 0.4.0

## Protezioni e isolamento

- Le pagine remote non ricevono integrazione Node.js.
- `contextIsolation`, `sandbox` e `webSecurity` sono abilitati; le API della UI passano attraverso il preload e IPC.
- La navigazione web standard è limitata a HTTP/HTTPS; i popup sono gestiti dal processo principale.
- Le sessioni private usano partizioni in memoria.
- Le estensioni richiedono conferma dell'utente e possono essere caricate solo da cartelle estratte Manifest V3 nella sessione persistente normale. Installare solo estensioni attendibili.
- Il blocco annunci usa liste di filtri scaricate e conservate in cache locale; al primo avvio necessita di rete e, se non esiste una cache valida, la protezione può non essere disponibile.

## Importazione dati da browser

- La scansione dei profili viene eseguita localmente nel processo principale e non carica l'elenco su servizi esterni.
- Per percorsi personalizzati, la cartella viene scelta tramite il dialogo nativo Electron; il renderer riceve solo un identificatore hash e le informazioni del profilo, non il percorso assoluto.
- L'interfaccia riceve identificatori hash per i profili, non percorsi assoluti.
- Preferiti Chromium vengono letti dal file `Bookmarks`; preferiti e cronologia Gecko vengono letti da `places.sqlite`; la cronologia Chromium viene letta da `History`.
- Per SQLite, Umbrella crea una copia temporanea del database e degli eventuali file `-wal`/`-shm`, interroga la copia e rimuove la cartella temporanea. Il database sorgente non viene aperto in scrittura.
- Umbrella non legge né trasferisce password, carte di pagamento, cookie, token/sessioni di accesso, estensioni o schede aperte.
- È consigliato chiudere il vecchio browser prima dell'importazione, per ridurre il rischio di leggere un archivio in aggiornamento.

## Registrazione browser predefinito Windows

- Le capacità di Umbrella vengono registrate nell'hive `HKEY_CURRENT_USER`, senza richiedere privilegi amministrativi per scrivere nelle chiavi del profilo utente.
- La registrazione crea ProgID e associazioni per HTTP/HTTPS e HTML, poi apre le impostazioni di Windows.
- Umbrella non modifica le chiavi protette `UserChoice` e non tenta di forzare il browser predefinito. Windows richiede all'utente di confermare la scelta.
- Il controllo dello stato verifica separatamente le associazioni effettive HTTP e HTTPS.

## Limiti aperti

Mancano ancora: UI completa di certificati/interstitial di sicurezza, gestione granulare persistente dei permessi per origine, eccezioni per sito dell'ad blocker, aggiornamento programmato dei filtri, safe browsing, cifratura del profilo, updater firmato, audit di penetrazione e test runtime automatizzati su Windows.

Prima della distribuzione pubblica, seguire la checklist ufficiale di sicurezza Electron: https://www.electronjs.org/docs/latest/tutorial/security
