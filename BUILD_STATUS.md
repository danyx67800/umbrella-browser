# Stato build — UMBRELLA 0.3.1

## Modifiche incluse nei sorgenti

- Wallpaper personalizzabile con copia in `userData/Umbrella/wallpapers`, scelta da Impostazioni e ripristino dello sfondo neutro.
- Rimosso lo sfondo anime predefinito e rimosso l'asset di wallpaper imposto.
- Logo Umbrella per le nuove schede; favicon di Chromium per le pagine web, con fallback Globe.
- Tooltip nativo del pulsante scheda: titolo e URL al passaggio del cursore. Nessun popover HTML personalizzato nella rail compressa.
- Menu contestuale schede spostato a `Menu` nativo Electron.
- Chiusura scheda: hide/remove della `WebContentsView` prima della chiusura dei WebContents; ricalcolo del contenuto attivo e osservazione ridimensionamento.
- Gestione estensioni: installazione da cartella estratta Manifest V3, consenso esplicito, enable/disable/remove e ripristino in avvio.
- Ad blocker con `@ghostery/adblocker-electron`, filtri ads + tracking e cache locale. Il motore viene inizializzato senza bloccare il primo avvio dell'interfaccia.
- Resizing più robusto di sidebar, workspace e WebContentsView.

## Verifiche eseguite

- `npm run typecheck`: completato.
- `npm run build`: completato.
- `npm run dist`: completato; generati l'installer NSIS e il pacchetto portable per Windows x64.
- Nessun certificato di firma configurato: gli eseguibili non sono firmati.

## Verifiche non completate

Non sono ancora stati eseguiti test manuali/runtime su Windows 10/11 (navigazione, schede, favicon, wallpaper, estensioni, ad blocker), né test d'integrazione, accessibilità, performance o audit di sicurezza. La generazione dei pacchetti non sostituisce questi controlli.

## Prossimi test su Windows

1. `npm install`
2. `npm run typecheck`
3. `npm run build`
4. `npm run dev`: testare menu nativo, chiusura schede in navigazione, favicon YouTube, drag/reorder, finestra stretta, wallpaper e persistenza dopo riavvio.
5. Aggiungere un'estensione Manifest V3 affidabile da cartella estratta e testarne permessi, riavvio e rimozione.
6. Verificare la protezione su pagine con annunci e tracker, compreso il primo avvio senza rete.
7. `npm run dist` su Windows x64 e test NSIS/portable su Windows 10/11 puliti.

## Limiti dichiarati

- Electron carica solo estensioni non compresse, supporta un sottoinsieme delle API Chrome e richiede ricaricamento all'avvio; le sessioni in memoria non supportano estensioni. Le estensioni Manifest V3 sono il target implementato.
- Il motore dei filtri è scaricato la prima volta e conservato in locale. Aggiornamento pianificato e allowlist per dominio non sono ancora implementati.
- Le estensioni sono associate al percorso scelto: spostare o cancellare la cartella originale impedisce il ripristino.
