# Verifica M4 — Ponte deterministico con il codice

Data: 30 ottobre 2026. Branch: `feat/m4-code-bridge`. M4 completa il percorso funzionale sul perimetro dichiarato: struttura multilinguaggio, importazione e Sync nativi, evidenze navigabili, rinomine confermate, versioni recuperabili e misure su repository reali. Non richiede account né chiamate IA. L'integrazione IA appartiene a M5; la riconciliazione bidirezionale appartiene a M6.

I verbali [M4.1](m4-1-verification.md), [M4.2](m4-2-verification.md) e [M4.3](m4-3-verification.md) rimangono documenti storici dei rispettivi incrementi. La [guida corrente](code-import.md) descrive comandi, perimetro, copertura e recupero.

## Criterio e riscontri

| Requisito M4 | Implementazione e verifica |
| --- | --- |
| Linguaggi più usati | 16 profili: JavaScript, TypeScript, TSX, Python, Java, C#, C, C++, Go, Rust, PHP, Ruby, Swift, Dart, Kotlin e Scala. Ogni profilo importa una fixture reale e attraversa modifica dell'intestazione, rinomina confermata e cancellazione, riusando il file invariato. |
| Struttura, contratti, gerarchia e copertura | AST Tree-sitter; diagrammi per file e System Map; intestazioni e contratti di tipo come testo sorgente. Inventario, tipi sintattici, errori, file esclusi/non supportati e costrutti irrisolti rimangono ispezionabili. Nessuna responsabilità o comportamento runtime viene dedotto. |
| Riferimenti semantici ed evidenze | Compilatore JS/TS/TSX integrato e ponte SCIP indipendente dal linguaggio. Due produttori esterni verificati: scip-typescript 0.6.0 e scip-python 0.6.8. Binding esatto sul nome, riferimenti e definizioni con file/hash/intervalli, produttore/versione e diagnostiche. |
| Identità | Spostamenti a contenuto identico univoci automatici; rinomine/spostamenti modificati con asserzione esplicita ID precedente → chiave sorgente corrente. Continuità dei discendenti univoci; rifiuto di copie, hint duplicati, scaduti e incompatibili. |
| Cambiamenti esterni e impatto | Osservatore nativo segnala modifiche; Sync su richiesta mostra file, dichiarazioni e dipendenze interessati, AST riusati e viste da rivedere tramite l'impatto M3. I file sorgenti rimangono intatti. |
| Incrementalità | Cache per hash/versione/perimetro. `SemanticDiagnosticsBuilderProgram` invalida JS/TS interessati dai cambi di contratto; documenti invariati vengono riusati e le diagnostiche persistono. I produttori SCIP esterni richiedono bundle freschi dopo cambiamenti. |
| Esperienza nativa | Import Codebase dalla home; anteprima e applicazione Sync; conferma rinomine; perimetro; collegamento bundle SCIP; Code Evidence con apertura di riferimento/definizione nell'editor. Analisi in utility process separato e avanzamento annullabile. |
| Recupero e concorrenza | Snapshot completi e immutabili della baseline, modello modificabile, marker di integrità, pointer atomico e lock `proper-lockfile`. Controlli di freschezza su sorgenti, modello, anteprima e snapshot attivo; ripristino dopo riavvio. |
| Distribuzione del motore | Installazione inclusa nel postinstall del repository; build di sviluppo e bundle desktop includono motore, worker, WASM selezionati, librerie TypeScript e licenze. Le dipendenze del progetto importato non vengono installate o eseguite. |

La copertura **sintattica** dei 16 profili non equivale a risoluzione semantica universale. Per Java/Kotlin/Scala, C#, C/C++, Go, Rust, PHP, Ruby, Swift e Dart questo rilascio certifica i costrutti strutturali delle fixture; non certifica un indicizzatore semantico completo per ciascuno. Il formato SCIP è comune, ma ogni produttore aggiuntivo richiede il proprio collaudo. Non sono unificati automaticamente namespace, tipi parziali, receiver Go o blocchi Rust `impl`. Vue/Svelte, SQL, shell e Visual Basic rimangono fuori dagli adattatori dichiarati.

## Controlli eseguiti

- Typecheck del pacchetto d’importazione e **67 test passati** di import/SCIP/Sync, matrice dei 16 linguaggi, identità, CLI e confine nativo.
- **59 test del dominio ADE, 45 del workbench e 18 del planner/build incrementale passati**; typecheck ADE e delle sorgenti di produzione; lint mirato ai file del workbench/build modificati. Controllo dei layer dell’intero contributo ADE passato. Il controllo globale upstream esaurisce gli 8 GiB del container e non viene dichiarato riuscito.
- Build client desktop reale, comprensiva di motore, librerie e grammatiche.
- Smoke Playwright/Electron su Linux: importazione di una codebase TypeScript/Python con file non supportato; alias risolto dal compilatore; cambio di firma, rinomina e cancellazione; ID conservato e AST invariato riusato; apertura del sorgente; ritorno al modello; riavvio e ripristino dello snapshot precedente senza rollback dei sorgenti.
- Verifiche negative: errori sintattici, overload, conflitti con annotazioni, Unicode UTF-8/16/32, file spostati/copiati, hint invalidi, sorgenti cambiati fra anteprima e pubblicazione, cancellazione completa, indice superato, artifact misti/incompleti, symlink nel namespace gestito, annullamento e importazioni concorrenti.

Lo smoke produce `.build/ade-smoke/m4-code-sync.png` e `m4-code-results.json`. La CI desktop esegue lo stesso `--code-only` su Linux e macOS. Questo verbale registra esecuzione locale Linux; non attribuisce un esito remoto alla CI né un collaudo macOS/VoiceOver non eseguito. I debiti di accessibilità/piattaforma già registrati in M2/M3 rimangono distinti dalla chiusura funzionale M4.

## Misure riproducibili

[Risultati grezzi, versioni, URL e SHA-256 degli archivi](benchmarks/m4-2026-10-30.json). Node 24.22.1, Linux x64, processi separati eseguiti in sequenza per repository. Un passaggio a freddo, uno invariato e una modifica limitata all'aggiunta di una riga iniziale; il file viene ripristinato. Nessuno script del repository viene eseguito. Queste sono osservazioni locali, non percentili o soglie prestazionali.

| Repository e perimetro | File / dichiarazioni | Import freddo | Invariato | Un file modificato | Picco RSS |
| --- | --- | --- | --- | --- | --- |
| Redux v5.0.1, `src/**` | 17 / 77 | 205,64 ms | 94,62 ms; 0 parsati / 17 riusati | 72,78 ms; 1 parsato / 16 riusati | 291 MiB, incluso compilatore |
| Click 8.1.8, `src/**` | 16 / 579 | 212,68 ms | 32,66 ms; 0 / 16 | 50,25 ms; 1 / 15 | 178 MiB |
| Chi v5.2.1, `**/*.go` | 73 / 402 | 258,29 ms | 38,26 ms; 0 / 73 | 30,31 ms; 1 / 72 | 176 MiB |

Su Redux il compilatore impiega 649,30 ms al primo passaggio e 18,70 ms a caldo, con 0 documenti rianalizzati e 16 riusati; proietta 124 dipendenze. La grammatica segnala `src/types/store.ts` come parziale: l'importazione mostra il limite e Sync dell'intero perimetro resta bloccato. I pacchetti terzi non sono stati installati: le diagnostiche del compilatore e i riferimenti non rappresentati rimangono visibili. Click e Chi sono misurati a livello strutturale; non viene attribuita loro una copertura semantica non misurata.

Sono stati confrontati col testo tutti i 1.058 intervalli dei nomi dichiarati: 1.058 corrispondenze esatte. Questa misura verifica la tracciabilità, non la correttezza di ogni relazione. Le fixture SCIP reali TypeScript/Python verificano esattamente due dipendenze attese ciascuna, compreso un alias importato e i rispettivi intervalli; i test negativi verificano l'assenza di associazioni incerte. Non è stata stimata una precisione/recall semantica generale sui tre repository e non è stato confrontato un modello OpenAI/Claude.

Per ripetere le misure su copie locali degli archivi registrati:

```sh
node ade/code-import/benchmark.mjs PATH_TO_REDUX redux-v5.0.1 'src/**'
node ade/code-import/benchmark.mjs PATH_TO_CLICK click-8.1.8 'src/**'
node ade/code-import/benchmark.mjs PATH_TO_CHI chi-v5.2.1 '**/*.go'
```

## Confini successivi

M5 può usare evidenze e revisioni di M4 per interpretazioni residue e implementazione assistita; non deve sostituire parser, compilatore, hash o regole affidabili con inferenze a consumo. Monorepo, nuovi framework/indicizzatori, risoluzione multi-progetto TypeScript e ambienti esterni al manifest richiedono campioni e adattatori ulteriori. M6 gestirà modifiche al codice originate dal modello e riconciliazione dei conflitti. Le configurazioni e i limiti correnti sono nella guida; non vengono promosse interpretazioni incerte a fatti.
