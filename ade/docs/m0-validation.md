# Verifica M0 — 28 ottobre 2026

## Perimetro

La revisione iniziale è `2395c5ad9c4f4a8e430aaeb85672c996512b7a6f`, basata sullo snapshot Code OSS `98da3bad3433b6aa1abf5638cddc014d70739838`. Il collaudo locale avviene su Linux x64 (Debian 13) nell’ambiente cloud, con Node 24.22.1 ed Electron 43.8.3. Non certifica macOS arm64.

## Verifiche ripetibili

- `npm --prefix ade/prototype run check` e `npm --prefix ade/prototype test`: controlli leggeri del modello.
- `npm run compile`: compilazione desktop e delle estensioni previste upstream.
- `npm run electron`: runtime corrispondente alla revisione dello snapshot.
- `node ade/scripts/smoke-desktop.mjs`: apertura workspace con profilo temporaneo, home nativa, navigazione demo/proprietà/IA, funzionalità future disabilitate, ripristino della selezione dopo chiusura e riavvio, comando A.D.E e caricamento dell’estensione di sviluppo. Su Linux senza display anteporre `xvfb-run -a`.
- Il test nell’Extension Host apre una copia temporanea del modello di acquisto, ne cambia il titolo e verifica l’aggiornamento HTML della webview. Un documento JSON incompleto conserva l’ultima vista valida. Il modello originale non viene modificato.
- Le schermate sono salvate in `.build/ade-smoke/` e caricate come artifact dalla CI desktop.

Gli esiti effettivi e gli eventuali impedimenti sono registrati a fine collaudo. Una configurazione CI presente non equivale a un’esecuzione riuscita.
