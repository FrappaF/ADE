# Verifica M5 — Collaborazione con CLI originali e implementazione recuperabile

Data: 31 ottobre 2026. Branch: `feat/m5-ai-collaboration`, creata dopo aggiornamento di `main` a `d61245d66da26e37a0e1cf2835e3b79daba9ae22`. Questa sezione registra le verifiche locali; gli esiti remoti sono nei [workflow della branch](https://github.com/FrappaF/ADE/actions?query=branch%3Afeat%2Fm5-ai-collaboration).

La [guida M5](ai-collaboration.md) descrive il percorso disponibile e i confini. L’implementazione copre il percorso funzionale Node.js dal modello al piano, al worktree, ai test e al ripristino. Il collaudo locale del motore usa provider simulati: non costituisce una verifica di un account ChatGPT/Claude reale e non chiude da solo il criterio end-to-end della milestone.

## Criteri e riscontri

| Requisito | Implementazione e verifica locale |
| --- | --- |
| Login e CLI dentro l’editor | Comandi nativi; login ChatGPT tramite servizio upstream quando compatibile con il profilo scelto, altrimenti `codex login`; `claude auth login` nel terminale integrato. Otto test del controller verificano instradamento, separazione degli account, modello nativo, budget, sequenza delle operazioni e blocco delle chiamate concorrenti. Non eseguono un login reale. |
| Preferenza senza IA | M4 rimane la fonte dei fatti; contesto, selezione suggerita dei file, identità, manifest, hash, schema, Git, test, rendering e recupero sono deterministici. Le interpretazioni senza diagnostiche residue terminano con zero invocazioni. |
| Piano, contesto e revisioni | Anteprima esplicita, selezione del modello e dei file, limiti in byte, `reviewId`, validazione strutturale e dei riferimenti, controlli di freschezza prima e dopo il provider. Il salvataggio del modello e il controllo del progetto attivo precedono invio, generazione e applicazione. |
| Prima implementazione | Fixture di pagamento rifiutato: piano, generazione strutturata, test Node reali, applicazione e annullamento. Verificata anche sul motore compilato e distribuito, con una CLI simulata eseguita come processo. Il provider reale resta da collaudare. |
| Controlli delle operazioni | Percorsi canonici, nessun comando del modello eseguito, input/output limitati, CLI in contesto temporaneo ristretto, worktree separato. La baseline Git e i conflitti di creazione vengono controllati prima di spendere la generazione. |
| Test e fallimenti | Criteri legati a file di test; eseguibile Node scelto dal prodotto, anche da un utility process Electron tramite `ELECTRON_RUN_AS_NODE`. Un fallimento o una modifica inattesa del worktree impediscono l’applicazione. |
| Recupero | Registro e preimmagini persistenti; annullamento dopo ricaricamento; recupero di una transazione interrotta; protezione dei contenuti modificati manualmente, dei permessi dei sorgenti preesistenti e della baseline Git. |
| Consumo e modelli | Token riportati separatamente per piano/generazione, costi effettivi sconosciuti lasciati tali, budget di invocazioni della CLI, nessuna escalation automatica. L’originale CLI mantiene retry e quote interni. |
| Benchmark | Tre repository campione indipendenti e controlli di accettazione non condivisi col modello. Il test del runner dimostra che un modello simulato con test generati apparentemente verdi può fallire tutti i controlli indipendenti. Risultati simulati non abilitano un default economico. Non sono state misurate prestazioni di modelli commerciali reali. |

## Controlli locali eseguiti

- **24 test del pacchetto M5 passati**, con veri processi Node e Git: pagamento rifiutato, applicazione/undo, ripresa, interruzione, sorgenti e contesti superati, permessi, BOM UTF-8, schema e riferimenti invalidi, percorsi, budget, timeout, cancellazione, CLI, confine di disclosure e benchmark simulato.
- **Otto test del controller nativo passati**, più il controllo generale degli errori del runner. `ade/scripts/test-ai-service.mjs` esegue il codice compilato con servizi iniettati e carica soltanto i token DI di chat/terminale, senza widget o sostituzioni dei globali DOM. È una verifica del controller, non del rendering Electron. La CI desktop esegue anche lo stesso file nel runner Electron ordinario.
- **59 test del dominio ADE passati**. Suite M4: **64/67 passati localmente**; tre test CLI ricevono stdout/stderr vuoti dai processi Node figli in questo sandbox. Il comportamento è riprodotto da un figlio Node minimale che non importa ADE; i corrispondenti file CLI M4 sono invariati. Non vengono dichiarati 67 test riusciti; la CI esegue la suite ordinaria nell’ambiente del runner.
- Typecheck del pacchetto M5, dell’importatore M4 e del contributo ADE passati; lint mirato passato; controllo dei layer sul contributo ADE con zero violazioni.
- Build client desktop reale e bundle del motore con parser, grammatiche e librerie TypeScript passati. Smoke del motore distribuito passato: quattro invocazioni della CLI simulata, scenario positivo applicato/annullato dopo ricaricamento e scenario negativo rifiutato, con sorgenti principali preservati.

Il [riepilogo macchina](validation/m5-local-2026-10-31.json) conserva ambiente, comandi, confini e hash degli input. Lo smoke genera inoltre `.build/ade-smoke/m5-results.json`.

## Verifiche esterne e chiusura

Il desktop Linux non è stato avviato localmente: il binario Electron non è disponibile e le richieste di accesso alla rete non sono arrivate a esecuzione; il Chromium di sistema termina sui vincoli IPC del sandbox (`setsockopt`/`shutdown: Operation not permitted`). Non viene attribuito un esito al collaudo grafico o al login reale. Le verifiche desktop Linux/macOS già aperte in M2/M3 restano distinte.

La CI della branch contiene test del pacchetto, smoke del bundle, controller isolato e controller nel runner Electron su Linux/macOS, oltre ai controlli desktop già presenti. Una configurazione di workflow non equivale a un’esecuzione riuscita: gli esiti vanno letti nei run associati alla revisione.

Per chiudere M5 occorrono il percorso grafico di pagamento rifiutato con una CLI e un account reali, il relativo ripristino e un confronto live dei modelli sui tre campioni. Le credenziali appartengono all’utente e non vengono inventate né sostituite con risposte simulate. Finché questi riscontri non sono registrati, il prodotto conserva il modello scelto esplicitamente e non dichiara un default economico certificato.
