# Stato build — UMBRELLA 0.4.0

## Modifiche incluse

- Onboarding riorganizzato in tre passaggi: trasferimento dati, browser predefinito e tema. I passaggi sono facoltativi.
- Nuova finestra **Importa dati** con scansione locale dei profili browser, selezione del browser, selezione del profilo e scelta tra preferiti e cronologia.
- Pulsante **Cerca cartella** per aggiungere manualmente un profilo Chromium/Gecko portable o collocato in un percorso personalizzato; il percorso viene scelto con il dialogo nativo e non viene passato dal renderer.
- Rilevazione dei profili Chromium più diffusi (Chrome, Edge, Brave, Opera, Opera GX, Vivaldi e derivati compatibili), profili Gecko (Firefox e derivati supportati) e preferiti Windows/Internet Explorer.
- Importazione locale di preferiti e cronologia: duplicati ignorati, limite di 3.000 URL recenti di cronologia per profilo e 5.000 voci conservate nel database Umbrella.
- Importazione Firefox/Gecko da SQLite attraverso una copia temporanea del database e degli eventuali file WAL/SHM; il profilo sorgente non viene modificato.
- Importazione manuale di file HTML/JSON come percorso alternativo per browser non rilevati o profili personalizzati (preferiti soltanto).
- Registrazione Windows per le app predefinite tramite ProgID, URLAssociations, FileAssociations e `HKCU\Software\RegisteredApplications`.
- Apertura diretta di `ms-settings:defaultapps?registeredAppUser=Umbrella`; verifica separata dello stato effettivo dei protocolli HTTP e HTTPS tramite `UserChoice`.
- Gestione del deep link quando Umbrella è già in esecuzione e viene aperto da un URL esterno.

## Verifiche eseguite in questo ambiente

- `node --experimental-strip-types --test electron/bookmarks.test.ts electron/navigation.test.ts electron/browser-import.test.ts`: **9 test superati, 0 falliti**.
- Controllo sintattico TypeScript/TSX con `typescript.transpileModule`: **18 file analizzati, 0 diagnostiche sintattiche**.
- Type-check isolato di `electron/browser-import.ts` con TypeScript strict e tipi Node globali: superato.
- Test aggiuntivi per profilo Gecko selezionato direttamente e profilo Chromium scelto da cartella personalizzata: superati.
- I test di importazione usano profili Chromium e Gecko simulati e database temporanei; non leggono i dati personali reali dell'utente.

## Verifiche non completate

- `npm ci` non è riuscito a completarsi perché il registry npm non era raggiungibile dall'ambiente di lavoro. Di conseguenza non è stato possibile eseguire il type-check completo del progetto, il build Vite/Electron o `electron-builder`.
- Nessun test runtime è stato eseguito su Windows 10/11. In particolare, la presenza di Umbrella nella pagina App predefinite e la selezione finale di HTTP/HTTPS devono essere verificate su un PC Windows reale.
- Nessun installer NSIS o pacchetto portable 0.4.0 è stato generato.

## Comandi da eseguire su Windows

```bash
npm install
npm run typecheck
npm test
npm run dev
npm run build
npm run dist
```

Durante il test manuale, verificare: rilevazione dei browser installati e dei profili, importazione di preferiti e cronologia, importazione da file HTML/JSON, registrazione Umbrella nelle App predefinite, selezione di HTTP e HTTPS, riapertura di link esterni e persistenza dopo il riavvio.

## Limiti dichiarati

- La scansione automatica copre i browser e i percorsi profilo standard elencati nel README. Non può garantire il rilevamento di ogni browser, fork o profilo installato in una cartella personalizzata; in quel caso si può usare **Cerca cartella** per profili Chromium/Gecko.
- La procedura diretta importa preferiti e cronologia. Password, carte di pagamento, cookie, sessioni, schede aperte ed estensioni non vengono trasferiti.
- Per browser/profili non rilevati è disponibile l'importazione manuale HTML/JSON dei preferiti; la cronologia di tali browser non viene importata da quel percorso alternativo.
- Windows conserva la scelta finale del browser predefinito: Umbrella registra i propri handler e apre la pagina corretta, ma l'utente deve confermare l'assegnazione dei protocolli.
