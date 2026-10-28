# Verifica M0 — 28 ottobre 2026

## Perimetro

La revisione iniziale è `2395c5ad9c4f4a8e430aaeb85672c996512b7a6f`, basata sullo snapshot Code OSS `98da3bad3433b6aa1abf5638cddc014d70739838`. Il collaudo locale avviene su Linux x64 (Debian 13) nell’ambiente cloud, con Node 24.22.1 ed Electron 43.8.3. Il successivo collaudo CI macOS arm64 è riportato sotto; il Mac originale non è stato raggiunto da questo ambiente.

## Verifiche ripetibili

- `npm --prefix ade/prototype run check` e `npm --prefix ade/prototype test`: controlli leggeri del modello.
- `npm run build-fast -- --client-only`, `node node_modules/@typescript/native/bin/tsc --project ade/tsconfig.production.json --pretty false`, `npm run gulp transpile-extensions compile-extension-media` e `npm run compile-copilot`: build desktop in fasi separate e verifica TypeScript di produzione separata dai test. La CI esegue questa sequenza; `ade/tsconfig.json` resta disponibile per iterazioni mirate sulla shell.
- `npm run electron`: runtime corrispondente alla revisione dello snapshot.
- `node ade/scripts/smoke-desktop.mjs`: apertura workspace con profilo temporaneo, home nativa, navigazione demo/proprietà/IA, funzionalità future disabilitate, ripristino della selezione dopo chiusura e riavvio, comando A.D.E e caricamento dell’estensione di sviluppo. Su Linux senza display anteporre `xvfb-run -a`.
- Il test nell’Extension Host apre una copia temporanea del modello di acquisto, ne cambia il titolo e verifica l’aggiornamento HTML della webview. Un documento JSON incompleto conserva l’ultima vista valida. Il modello originale non viene modificato.
- Le schermate sono salvate in `.build/ade-smoke/` e caricate come artifact dalla CI desktop.

Gli esiti effettivi e gli impedimenti sono registrati qui sotto. Una configurazione CI presente non equivale a un’esecuzione riuscita.

## Esiti locali

| Verifica | Esito |
| --- | --- |
| Node selezionato da `.nvmrc` | 24.22.1, verificato |
| Dipendenze | Installazione completata e stato upstream `isUpToDate()` verificato; retry del download Copilot dopo ECONNRESET |
| Controlli e test Node del prototipo | Superati |
| TypeScript mirato al contributo nativo A.D.E | Superato |
| ESLint dei tre moduli TypeScript A.D.E | Superato, senza avvisi |
| Client di sviluppo (`npm run build-fast -- --client-only`) | Superato sul branch A.D.E e su quello di prova upstream |
| Estensioni integrate e asset | `transpile-extensions compile-extension-media` superato, incluse le verifiche TypeScript degli asset |
| Estensione Copilot upstream | Build superata; funzionalità disabilitate per impostazione predefinita nella shell |
| Desktop Electron Linux | Home, demo, proprietà, IA indisponibile, comando e ripristino dopo riavvio superati |
| Prototipo nell’Extension Host | Attivazione, comando, rendering, aggiornamento e recupero JSON superati |
| Aggiornamento upstream | Delta `98da3bad` → `915c6fae`, senza conflitti; build di sviluppo e smoke superati |
| Test pertinenti al delta upstream | 54 superati: `CanvasEditor` e `Sessions - Agents Part Card` |
| Ritorno alla base A.D.E | Manifest originale conservato, branch `work` ripristinato e client ricompilato |
| Typecheck globale upstream | Non superato: processo terminato dal limite di memoria; nessuna diagnostica TypeScript prima della terminazione |
| CI macOS arm64 iniziale | Build, verifica A.D.E e smoke superati su `8f21fe76`; [esecuzione](https://github.com/FrappaF/ADE/actions/runs/40720152689) |
| CI Linux iniziale | Download npm interrotto con ECONNRESET; job Linux riavviato separatamente |
| Typecheck di produzione senza test come file iniziali | Superato localmente: 294,6 secondi, picco RSS circa 5,15 GiB; ora configurato nella CI |
| Mac originale | Xcode/Command Line Tools e avvio locale ancora da verificare direttamente |

Il typecheck globale upstream è stato terminato due volte dal limite di 8 GiB dell’ambiente, anche con `GOMEMLIMIT=4GiB GOMAXPROCS=2 npm run gulp compile-client`. Nel secondo tentativo l’emissione JavaScript ha riportato zero errori, ma il processo TypeScript è stato ucciso: la compilazione globale **non è superata**. La build di sviluppo e la verifica TypeScript mirata A.D.E sono invece passate. La CI separa le fasi e non dichiara di sostituire il controllo TypeScript dell’intero snapshot.

Lo smoke ha rilevato e fatto correggere l’overlay iniziale Copilot ereditato da VS Code, che bloccava la home. Il prodotto ora disabilita quell’onboarding e le funzioni Copilot non configurate tramite valori predefiniti. Il test dell’Extension Host attende la propagazione effettiva della tab prima di verificarla.

La pubblicazione inizialmente bloccata dal controllo automatico è stata autorizzata dall’utente. Il branch `codex/m0-foundation` è stato pubblicato su FrappaF/ADE e la CI è stata avviata. Il risultato della CI macOS non certifica la riparazione di Xcode/Command Line Tools sul Mac originale.

Il collaudo finale è stato ripetuto dopo la ricostruzione del client e delle estensioni: sia lo smoke nativo con riavvio sia il test nell’Extension Host sono passati. Il test completo e il report di manutenzione sono riferiti alla base originale A.D.E; la prova upstream resta su un branch separato.

Nell’ambiente cloud di collaudo, `source .build/ade-cloud-env.sh` seleziona Node e i prerequisiti nativi installati nello spazio di lavoro. È un file locale generato e ignorato da Git; per altri sistemi seguire i prerequisiti della guida.

L’[analisi dell’ingombro](build-footprint.md) descrive la nuova configurazione di produzione e i candidati a un futuro profilo desktop essenziale. La verifica globale originale, che include anche i test, resta distinta e non superata nel cloud da 8 GiB.
