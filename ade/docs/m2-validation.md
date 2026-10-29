# Verifica della prima shell M2.1

> Verbale storico importato da `feat/m2-visual-workbench`, commit `bbfc20878977698fa278c2995800259e6915d25d`. Registra i risultati riportati dal thread sorgente sulla sua revisione M2.1. Le verifiche della revisione combinata M2/M3 sono documentate separatamente nell’[integrazione selettiva](m2-branch-integration.md).

Collaudo locale del 30 ottobre 2026 (Europe/Rome), branch `feat/m2-visual-workbench`, base `a8d677e9`. Ambiente: macOS 26.6.2, build 25G83, arm64; Node 24.22.1; Electron 43.8.3. I test Mac M0/M1 confermati dall’utente rimangono validi per quelle revisioni; questo verbale riguarda la nuova shell.

## Risultati

| Controllo | Esito |
| --- | --- |
| Dominio M1 e navigazione semantica | 16 test Node superati: schema, migrazione, identità, riferimenti, appartenenza delle viste, diagrammi condivisi e ripristino delle selezioni |
| Prototipo storico | Controllo sintattico e 3 test Node superati |
| TypeScript del contributo e dipendenze | `npm run ade:check` superato |
| ESLint dei file TypeScript interessati | Superato |
| Stylelint della shell | Superato |
| Client e risorse | Build con `npm run build-fast -- --client-only` superata |
| Estensioni integrate | Transpilazione e compilazione media superate |
| Componente Copilot upstream | Compilazione superata fuori dal sandbox; resta disabilitato nel prodotto per impostazione predefinita |
| Smoke nativo senza estensione di sviluppo | Superato: home, sidebar Sistema predefinita, due feature e relativi diagrammi, canvas, selezione da tastiera e proprietà |
| Consultazione tecnica | File, Debug e Git con ritorno al diagramma; apertura/chiusura del terminale senza perdita della selezione |
| Persistenza del contesto | Diagramma e selezioni distinte ripristinati dopo riavvio della demo e dopo rilettura di un documento reale con contenuti diversi dalla demo |
| Aggiornamenti esterni ed errori | Documento invalido sostituisce canvas e navigazione con diagnostica; il ripristino del documento valido aggiorna entrambe le viste |
| Finestra stretta | Proprietà sotto il canvas, scorrimento del diagramma; schermata ispezionata |
| Extension Host storico | Attivazione del prototipo, rendering, aggiornamento e recupero da JSON incompleto superati separatamente |

Lo smoke è `node ade/scripts/smoke-desktop.mjs`; usa soltanto cartelle temporanee per progetto, profilo, estensioni e dati portable. Il profilo viene scritto in `portable/user-data`, perché la modalità portable ha precedenza su `--user-data-dir`. Questo corregge un errore dello script precedente, che scriveva le impostazioni in un profilo ignorato; il dialogo integrato è ora effettivamente abilitato nel test.

Le schermate locali, non versionate, sono in `.build/ade-smoke/`: home, diagramma, proprietà, documento invalido e documento ripristinato in finestra stretta. Il test della nuova shell viene eseguito prima e senza `--extensionDevelopmentPath`; solo il successivo test storico carica `ade/prototype/`.

## Confini

La shell è una prima consegna M2.1: una scheda visuale attiva, canvas di consultazione, navigazione e proprietà. Creazione, collegamenti modificabili, zoom/pan dedicati, salvataggio, undo/redo e schede visuali indipendenti appartengono a M2.2. I diagrammi non strutturali mostrano i nodi e le relazioni dichiarati, senza supporto completo alla notazione UML.

Il collaudo locale non certifica Linux, Windows, la CI remota, il controllo TypeScript globale upstream, tutti i temi o una revisione completa di accessibilità. Il workflow desktop esistente eseguirà anche il nuovo smoke al successivo push/PR; nessuna nuova esecuzione remota viene dichiarata in questo verbale.
