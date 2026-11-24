# Note di sicurezza — UMBRELLA 0.3.1

## Protezioni attuali

- Nessuna integrazione Node.js nelle pagine remote e nella UI renderer.
- `contextIsolation`, `sandbox` e `webSecurity` abilitati.
- API preload limitata; le pagine web non ricevono IPC interni.
- Navigazione normale limitata a HTTP/HTTPS; popup intercettati.
- Prompt di consenso per un insieme limitato di permessi; gli altri vengono negati.
- Sessioni private con partizioni in memoria e senza salvataggio cronologia/sessione.
- Ad blocker basato su liste pubblicitarie e anti-tracking; il suo stato di disponibilità è mostrato nelle impostazioni.
- Le estensioni richiedono conferma prima dell'installazione e possono essere caricate solo come cartelle Manifest V3 estratte nella sessione persistente normale.

## Dati e connessioni

- I dati locali sono salvati in `userData/Umbrella`.
- Al primo avvio, l'ad blocker contatta le fonti dei filtri predefiniti Ghostery e conserva il motore in cache locale. Se la rete non è disponibile e non esiste una cache, la protezione non può essere attivata.
- Installare un'estensione significa eseguire codice di terze parti: può leggere o modificare siti secondo i permessi richiesti. L'utente deve installare solo estensioni attendibili.
- Le estensioni non vengono caricate nelle sessioni private.

## Limiti ancora aperti

Mancano: UI di certificati/interstitial di sicurezza, gestione granulare persistente dei permessi per origine, eccezioni per sito dell'ad blocker, aggiornamento programmato dei filtri, safe browsing, cifratura profilo, codice di update firmato, audit di penetrazione, test automatici browser e revisione formale della sicurezza.

Prima della distribuzione pubblica, rivedere la checklist aggiornata di Electron: https://www.electronjs.org/docs/latest/tutorial/security
