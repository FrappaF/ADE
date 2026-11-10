# Importazione del codice e Sync — M4

Questa guida descrive anche gli adattatori e i comandi standalone dei precedenti incrementi M4. Il percorso corrente di importazione dei diagrammi nell’app è l’[esplorazione incrementale](diagram-workflow.md), con documento v5 e servizi di query/proposta condivisi; non richiede il piano globale descritto dai protocolli storici.

M4 collega il modello ai sorgenti con analisi locale deterministica, senza account, chiamate IA o esecuzione del progetto importato. La base Tree-sitter copre 16 profili; il compilatore TypeScript integrato risolve JS/TS/TSX e il ponte SCIP collega indicizzatori esterni, con produttori TypeScript/Python verificati. Sono disponibili importazione, anteprima Sync, perimetro, rinomine confermate, evidenze navigabili e ripristino nativi. Il [verbale M4](m4-verification.md) registra matrice, benchmark e confini di copertura; l'IA appartiene a M5.

## Percorso desktop

1. Dalla home scegliere **Import Codebase**, la cartella e il livello di analisi. **Structure Only** conserva questo livello anche nei Sync successivi; **Structure and Available Semantic Analysis** usa il compilatore integrato per JS/TS. Gli altri profili producono struttura e diagnostiche senza richiedere una toolchain.
2. Esplorare **System Map**, diagrammi dei file e, quando disponibili, **Code Dependencies**. **Code Evidence** ispeziona dichiarazioni e riferimenti dell'elemento selezionato; **A.D.E: Inspect Code Evidence** apre anche inventario, esclusioni e diagnostiche dell'intero progetto. Selezionare una dichiarazione, un riferimento o la sua definizione apre il sorgente nel normale editor con selezione. Un hash superato viene segnalato e il file corrente si apre senza applicare la vecchia selezione.
3. Modificare il codice con gli strumenti consueti. L'osservatore segnala **Source Changes Detected**; l'analisi parte su richiesta con **Sync**. L'anteprima mostra file/simboli/dipendenze interessati, AST riusati e viste da rivedere. **Confirm a Symbol Rename** associa esplicitamente dichiarazione precedente e corrente; ripetere per più rinomine. **Apply Sync** pubblica una nuova versione. Conflitti, sorgenti parziali o indici superati non pubblicano aggiornamenti.
4. **A.D.E: Configure Import Scope** modifica include/esclusioni tramite una nuova anteprima. **A.D.E: Attach SCIP Bundles** collega bundle freschi alla stessa radice/revisione; non installa né avvia indicizzatori. Dopo cambiamenti occorre rigenerare tutti i produttori esterni precedentemente collegati. Il compilatore integrato viene aggiornato automaticamente.
5. **A.D.E: Restore Code Model Snapshot** riapre un'altra versione completa del modello e dell'indice. Il codice mantiene i contenuti correnti. **Open Project** sulla cartella sorgente riapre la versione attiva, anche dopo un riavvio.

Le versioni native risiedono in `.ade/imports/<uuid>/`; `.ade/code-project.json` seleziona quella attiva con sostituzione atomica. `.ade` è sempre esclusa dall'inventario: scrivere metadati non invalida i sorgenti. La CLI conserva il vincolo di output esterno; il desktop può scrivere dentro la codebase soltanto nel proprio namespace verificato, senza seguire symlink. Il modello corrente va salvato prima di Sync. Le versioni precedenti restano recuperabili e non vengono eliminate automaticamente. `proper-lockfile` impedisce pubblicazioni concorrenti; un lock lasciato da un processo interrotto scade dopo cinque minuti. Annullamento, hash cambiati e modifiche concorrenti al modello invalidano l'anteprima. Le cache sono locali al processo di analisi separato dalla UI.

## Esecuzione

Usare Node dalla `.nvmrc`, poi dalla radice:

```sh
npm --prefix ade/runtime ci --ignore-scripts
npm --prefix ade/code-import ci --ignore-scripts
npm --prefix ade/code-import run check
npm --prefix ade/code-import test
node ade/code-import/cli.mjs ade/examples/code-import /tmp/ade-code-import-demo checkout-import
```

La cartella di destinazione deve essere nuova, con il genitore già esistente, e fuori dal sorgente. Se `/tmp/ade-code-import-demo` esiste, scegliere un altro nome. Il comando non sovrascrive file esistenti. Aprire `/tmp/ade-code-import-demo/model.ade.json` tramite **A.D.E: Open Project**; System Map espone cartelle, moduli e dichiarazioni, mentre ogni file ha un diagramma strutturale. `code-index.json` conserva linguaggio, diagnostiche, dichiarazioni, intestazioni, import e posizioni delle evidenze. `import-state.json` contiene la proiezione generata usata come baseline; `snapshot.json` marca un salvataggio completato e verifica l'integrità di stato e indice. Il modello resta modificabile. Gli snapshot possono essere spostati come cartelle complete; conservano il percorso assoluto canonico del sorgente e i percorsi relativi delle evidenze. Lo spostamento dell'intera radice sorgente richiede una nuova importazione. Il desktop aggiunge il lettore e la navigazione descritti sopra.

L'esempio è un insieme di sorgenti TypeScript, Python e Java indipendenti, non un'applicazione distribuita eseguibile. La presenza di nomi simili non dimostra comunicazione fra servizi: nessun collegamento viene inventato.

## Stato e Sync incrementale M4.2

Dopo l'importazione si può modificare il modello nel workbench, salvarlo, modificare manualmente il sorgente e chiedere un'anteprima senza scritture:

```sh
node ade/code-import/cli.mjs status /tmp/ade-code-import-demo
```

Il report elenca file aggiunti, modificati, rimossi, invariati e spostati; dichiarazioni interessate; file rianalizzati/riusati; conflitti e ambito preliminare di revisione. Quest'ultimo riusa l'analisi dell'impatto M3 sulle relazioni già dichiarate nel modello, non certifica dipendenze fra sorgenti che non sono ancora risolte.

Per applicare l'aggiornamento a una nuova cartella:

```sh
node ade/code-import/cli.mjs sync /tmp/ade-code-import-demo /tmp/ade-code-sync-2
```

Aprire `/tmp/ade-code-sync-2/model.ade.json`. Il nuovo snapshot contiene anche `sync-report.json`; per il prossimo Sync usare `/tmp/ade-code-sync-2` come versione precedente. Per tornare indietro riaprire la cartella precedente. Il tool non cambia il sorgente, non sovrascrive la versione precedente e non seleziona implicitamente quale ramo di snapshot considerare corrente. I risultati prodotti da M4.1 prima dell'introduzione di `import-state.json`/`snapshot.json` richiedono una nuova importazione iniziale.

La cache usa identità di progetto/radice, versione dell'adattatore e hash del contenuto; non si affida alle sole date di modifica. I file invariati non sono riparsati. Uno spostamento mantiene ID di modulo, dichiarazioni e diagramma soltanto quando esistono una cancellazione e un'aggiunta dello stesso contenuto/dialetto, con una sola corrispondenza in ciascun inventario completo. È una continuità di contenuto, non una prova dell'intento Git o del comportamento; copie e corrispondenze multiple non acquisiscono gli ID dell'originale. I nuovi percorsi vengono associati a chiavi sorgenti aggiornate, così una modifica successiva conserva l'identità spostata; riutilizzare il vecchio percorso alloca un'identità distinta. Per rinomine di simboli e spostamenti con modifiche si può confermare una corrispondenza esatta fra vecchio ID e nuova chiave sorgente. Tipi incompatibili, copie che conservano l’originale, riuso di ID e corrispondenze multiple vengono rifiutati. I discendenti con nome/tipo univoci conservano l’identità dopo una rinomina del contenitore; l’asserzione è registrata in `analysis.symbolRenames`.

Sync confronta baseline generata, modello salvato dall'utente e nuova proiezione. Conserva annotazioni, contratti comportamentali manuali, relazioni, posizioni e nodi nascosti quando compatibili con il cambiamento sorgente. Nuovi nodi non spostano quelli esistenti. Modifiche concorrenti allo stesso campo, cancellazioni di elementi modificati manualmente, riferimenti manuali divenuti invalidi, sorgenti parziali, overload modificati o spostamenti ambigui bloccano il risultato: il report contiene i conflitti e nessuna versione viene pubblicata. L'exit code è `2` per conflitti, `1` per errori di esecuzione/input, `0` per un risultato valido; `status` usa gli stessi codici senza scrivere snapshot. La riconciliazione bidirezionale e la risoluzione interattiva dei conflitti restano in M6.

Gli input persistiti vengono validati con JSON Schema tramite Ajv, più i controlli di dominio M1, manifest, chiavi sorgenti e coerenza della proiezione. Prima del marcatore finale il tool ricontrolla il sorgente e, in Sync, i byte della versione precedente. Annullamento con Ctrl+C, errori e revisioni superate non aggiornano la baseline precedente; le scritture incomplete vengono rimosse quando l'errore è gestibile. Un arresto forzato può lasciare una cartella senza marcatore, che il lettore rifiuta. Gli indici generati `import-state.json` e `code-index.json` sono limitati a 256 MiB ciascuno; modello e altri artifact restano limitati a 64 MiB. Gli indici vengono scritti come JSON compatto, mantenendo la lettura dei precedenti indici formattati e gli stessi controlli di integrità. I controlli di integrità rilevano modifiche accidentali e file mescolati, non sono firme crittografiche. La verifica di freschezza è ottimistica: non blocca altri editor e non sostituisce lo snapshot atomico del filesystem o la gestione documentale nativa.

## Riferimenti semantici SCIP — M4.3

[SCIP](https://github.com/scip-code/scip) è un protocollo di indicizzazione indipendente dal linguaggio. Il ponte legge il sottoinsieme JSON di metadata, documenti, definizioni e riferimenti, senza risolvere simboli per somiglianza di nomi. I produttori mantengono parser, type checker e conoscenza del linguaggio. M4.3 è stato collaudato con `@sourcegraph/scip-typescript` 0.6.0 e `@sourcegraph/scip-python` 0.6.8, basato su Pyright; gli altri backend restano da verificare. La copertura sintattica multilinguaggio della tabella seguente continua a funzionare senza questi strumenti.

Gli indicizzatori sono opzionali ed esterni al pacchetto ADE. Per riprodurre il percorso provato, installarli in una directory separata:

```sh
mkdir -p /tmp/ade-scip-tools
npm --prefix /tmp/ade-scip-tools install --ignore-scripts @sourcegraph/scip-typescript@0.6.0 @sourcegraph/scip-python@0.6.8
node ade/code-import/cli.mjs ade/code-import/test/fixtures/scip/typescript /tmp/ade-scip-base checkout-scip
node ade/code-import/capture-scip.mjs /tmp/ade-scip-base /tmp/ade-typescript.bundle.json --position-encoding utf16 -- node "$PWD/ade/code-import/produce-scip.mjs" typescript /tmp/ade-scip-tools
node ade/code-import/cli.mjs status /tmp/ade-scip-base --scip /tmp/ade-typescript.bundle.json
node ade/code-import/cli.mjs sync /tmp/ade-scip-base /tmp/ade-scip-with-dependencies --scip /tmp/ade-typescript.bundle.json
```

Aprire `/tmp/ade-scip-with-dependencies/model.ade.json`: il diagramma **Code Dependencies** mostra le dipendenze estratte. `code-index.json` e `import-state.json` contengono `semantic`, con produttori/versioni, digest dei bundle, file coperti, binding esatti, intervalli delle definizioni e dei riferimenti, revisioni e diagnostiche. Le relazioni del modello sono `dependency`: il protocollo non certifica da solo invocazioni, letture/scritture di risorse o esecuzioni runtime. Il lettore nativo mostra produttore, riferimento e definizione, apribili nell’editor.

Per provare Python, usare la cartella `ade/code-import/test/fixtures/scip/python` nell'importazione iniziale e `python` al posto di `typescript` nel comando del produttore, scegliendo nuove destinazioni. Il produttore dimostrativo Python imposta un ambiente pacchetti vuoto esplicito e non ispeziona pip; risolve il progetto locale, mentre integrazioni con ambienti reali e pacchetti terzi richiedono un comando indicizzatore configurato per quel progetto. L'helper usa i binding protobuf ufficiali inclusi nel pacchetto TypeScript per leggere il binario prodotto da entrambi; non contiene un decoder binario artigianale. [Provenienza e rigenerazione delle fixture](../code-import/test/fixtures/scip/README.md) documentano gli indici usati nei test offline.

`capture-scip.mjs` esegue **solo il comando passato esplicitamente dopo `--`**, nella radice sorgente, senza shell implicita. Deve essere un produttore fidato che rigenera l'indice corrente e stampa soltanto JSON su stdout; `produce-scip.mjs` fornisce i due percorsi verificati senza installazioni automatiche, mentre produttori diversi possono usare la [CLI ufficiale `scip print --json`](https://github.com/scip-code/scip/blob/main/docs/CLI.md). La cattura confronta il manifest prima e dopo il comando e registra la revisione nel bundle. Non può dimostrare che un comando arbitrario abbia davvero rigenerato l'indice: limitarsi a stampare un vecchio file SCIP non soddisfa questo contratto. Le capacità e la precisione dipendono dal produttore scelto; SCIP ammette anche indicizzatori euristici. I comandi esterni possono eseguire operazioni proprie della toolchain; nessun produttore viene avviato dal normale import o da Sync senza una cattura esplicita.

L'output deve dichiarare `metadata.project_root` come URI `file:` della radice selezionata e percorsi relativi canonici. Posizioni UTF-8, UTF-16 e UTF-32 vengono convertite in offset UTF-16, rifiutando posizioni fuori dal testo o dentro un carattere. Sono accettati intervalli SCIP compatti a tre/quattro interi e intervalli tipizzati, inclusi i wrapper JSON della CLI Go. Per gli indicizzatori storici che non emettono `position_encoding`, il fallback va indicato esplicitamente con `--position-encoding`; per i due produttori verificati è `utf16`. Non viene dedotto dal nome del linguaggio: anche scip-python è implementato in TypeScript. Un `Document.text` vuoto è il valore Proto3 predefinito per testo omesso; un testo non vuoto discordante viene rifiutato.

Le definizioni vengono associate solo quando il loro intervallo coincide con il nome dichiarato da Tree-sitter. Parametri, variabili e altri simboli senza un elemento ADE restano `unboundDefinition`/`unboundReference`. Più definizioni candidate dello stesso simbolo producono `ambiguousSymbol`, senza sceglierne una. Gli identificatori locali sono isolati per documento e produttore; i bundle di produttori diversi non vengono collegati automaticamente tra loro. Il contenitore di un riferimento è la dichiarazione sintattica più interna, oppure il modulo. Un indice a intervalli evita una scansione completa delle dichiarazioni per ogni riferimento.

File fuori dal perimetro, documenti assenti, dichiarazioni senza binding e relazioni SCIP non proiettate hanno diagnostiche esplicite (`outsideScope`, `missingDocument`, `missingDefinition`, `unresolvedRelationship`). La presenza di un bundle non equivale alla copertura completa del progetto. Si possono passare più `--scip BUNDLE` per un progetto poliglotta, sostituendo l'insieme delle evidenze semantiche con quello fornito; ogni bundle deve riferirsi alla stessa radice/revisione. Gli altri linguaggi richiedono sia dichiarazioni sintattiche rappresentabili sia un backend SCIP verificato, non un'interpretazione IA.

Dopo una modifica ai sorgenti o alle configurazioni riconosciute, i binding precedenti non vengono riutilizzati. `status`/`sync` riportano `incompleteSemantic` e non pubblicano una versione finché non si acquisiscono nuovi bundle. La cache sintattica riusa i file invariati. I produttori esterni ricostruiscono il proprio indice; il compilatore JS/TS integrato usa invece `SemanticDiagnosticsBuilderProgram` per invalidare i file interessati dalle modifiche delle firme e riusare i documenti invariati. Il report comprende dipendenze aggiunte/modificate/rimosse e l'impatto usa anche le relazioni semantiche della baseline. Etichette e modifiche manuali incompatibili con gli aggiornamenti restano conflitti, secondo il percorso M4.2.

Il manifest include ora configurazioni note: package/lockfile npm, pnpm e Yarn, tsconfig/jsconfig, pyrightconfig, pyproject, Pipfile, requirements, Poetry/uv, Go/Cargo, Maven/Gradle, progetti .NET, Gemfile, Composer, manifest Swift/Dart e configurazioni CMake/compilazione C++. Sono registrate come `configuration`, senza convertirle in componenti del modello; superare 2 MiB provoca un errore esplicito. File di configurazione non riconosciuti, configurazioni esterne al perimetro e dipendenze installate modificate senza cambiare i manifest restano fuori da questa verifica. La cattura verifica gli input tracciati, non blocca il filesystem e non certifica l'intero ambiente di compilazione.

## Copertura disponibile

La registrazione in `languages.ts` è separata dal motore comune. Tutti i profili seguenti hanno una fixture eseguibile nei test; questa verifica riguarda i costrutti indicati, non l'intera grammatica o tutti i framework.

| Linguaggio | Estensioni | Dichiarazioni proiettate, nei casi supportati |
| --- | --- | --- |
| JavaScript | js, jsx, mjs, cjs | Classi, funzioni, metodi, binding di arrow function |
| TypeScript | ts, mts, cts, tsx | Classi, interfacce, alias di tipo, funzioni, metodi, binding di arrow function; TSX ha un profilo distinto |
| Python | py, pyi | Classi, funzioni, metodi |
| Java | java | Classi, interfacce, enum, record, metodi, costruttori |
| C# | cs | Classi, interfacce, struct, enum, record, metodi, costruttori |
| C | c, h | Struct, union, enum, definizioni di funzione |
| C++ | cpp, cc, cxx, hpp, hh, hxx | Classi, struct, union, enum, definizioni di funzione |
| Go | go | Tipi nominati, funzioni e metodi |
| Rust | rs | Struct, enum, trait, alias, blocchi impl, funzioni |
| PHP | php | Classi, interfacce, trait, enum, funzioni, metodi |
| Ruby | rb, rake | Classi, moduli e metodi nominati |
| Swift | swift | Classi e altri costrutti della grammatica class_declaration, protocolli, funzioni nominate |
| Dart | dart | Classi, enum, extension, mixin, firme di funzione/metodo |
| Kotlin | kt, kts | Classi, oggetti, alias e funzioni nominate |
| Scala | scala, sc | Classi, oggetti, trait, alias e funzioni nominate |

Classi, moduli e contenitori diventano componenti, funzioni/metodi diventano azioni e interfacce/alias riconosciuti diventano contratti. È una proiezione strutturale, non un'attribuzione di responsabilità o feature. Le intestazioni, e il testo completo dei contratti di tipo, sono estratti dal sorgente: non sono input/output, precondizioni o criteri di accettazione già normalizzati nel contratto comportamentale M3. I membri delle interfacce restano dentro il contratto; non vengono trasformati in implementazioni.

Il contenimento usa l'annidamento sintattico, non la risoluzione dei tipi. Per esempio, un metodo Go con receiver resta nel modulo e un blocco `impl` Rust è un contenitore distinto dalla struct. Package, namespace, estensioni e tipi parziali non vengono unificati semanticamente. Overload e omonimie nello stesso contenitore hanno ID distinti e una diagnostica: il loro ordine non costituisce prova di continuità. Dichiarazioni anonime o con nomi calcolati non rappresentabili producono `unnamedDeclaration`.

Ogni file riporta conteggi per i tipi sintattici visitati, anche non proiettati. Import/include/use riconosciuti sono conservati come evidenze testuali; la proiezione sintattica lascia le destinazioni non risolte, mentre il livello SCIP separato può aggiungere i riferimenti verificati dal produttore. `require` Ruby, macro, chiamate e altri costrutti elencati dal profilo sono segnalati come `unresolvedConstruct`, aggregati per tipo con conteggio e prima posizione. Queste diagnostiche descrivono i limiti del parser e non vengono cancellate per la sola presenza di SCIP. Il modello non contiene archi di invocazione/dipendenza ricavati per somiglianza dei nomi. La lista di diagnostiche non è una classificazione esaustiva di tutti i costrutti non proiettati.

Errori di parsing rendono il file `partial`; le dichiarazioni recuperabili possono restare disponibili, con diagnostiche e posizioni nell'indice. Visual Basic, SQL, shell e altri formati riconosciuti senza adattatore sono `unsupported`. Le estensioni sconosciute sono `unclassified`, mai certificate come non sorgenti. `.h` usa C per default; `languageOverrides` consente di assegnarlo a C++. Vue/Svelte e altri file con linguaggi incorporati richiedono profili dedicati.

## Evidenze, identità e limiti

Gli hash SHA-256 sono calcolati sul testo letto in UTF-8. Ogni dichiarazione conserva file relativo, hash, intervallo UTF-16 con fine esclusa e righe a partire da 1. Le mappature M1 registrano lo stesso hash; il manifest d'importazione è un hash dei percorsi/stati/revisioni, non un commit Git né una verifica runtime. Identità di progetto, percorso relativo, contenimento sintattico, tipo e nome della dichiarazione determinano le chiavi sorgenti. Gli ID persistiti mantengono anche la continuità dei file spostati nei casi descritti sopra. Cambi di formattazione e di firma mantengono l'ID nei casi non ambigui; rinominare un simbolo non implica automaticamente continuità. Progetti distinti devono usare identificatori distinti.

L'inventario è ordinato, non segue link simbolici e registra le directory escluse: `.git`, `.ade`, `node_modules`, `vendor`, `dist`, `build`, `out`, `target`, `bin`, `obj`, `__pycache__`, `.venv`, `venv`, `.next`, `.build`. Applica `.gitignore` annidati tramite la libreria `ignore`, `.adeignore` alla radice e globs `minimatch` per gli include. Le directory predefinite sono configurabili; le esclusioni esplicite prevalgono sulle ri-inclusioni Git. Le configurazioni riconosciute vengono comunque lette e sottoposte a hash. `.git` resta esclusa e `.ade` non entra nel manifest. Il limite è 100.000 voci visitate, comprese le directory, e 2 MiB per sorgente; file troppo grandi sono segnalati, un inventario oltre il limite fallisce senza produrre un risultato incompleto presentato come riuscito e indica come restringere il perimetro tramite `.adeignore` o le esclusioni dello scope. L'analisi verifica gli hash di tutti i sorgenti supportati e delle configurazioni riconosciute, ma rianalizza soltanto la sintassi dei file invalidati. Per altri formati l'inventario confronta percorsi e stati senza leggerne il contenuto. L’invalidazione selettiva semantica è disponibile per il compilatore JS/TS; gli altri produttori mantengono le proprie strategie.

Parser e alberi sono rilasciati dopo l'uso; le grammatiche WASM sono caricate una volta per processo. Non si eseguono sorgenti, script di installazione del progetto importato o build. Le sole scritture della CLI sono nella nuova cartella di output; `status` è in sola lettura. Il modello della versione precedente resta intatto anche in caso di conflitto.

## Scelta tecnica e prossimi adattatori

La ricerca del 30 ottobre 2026 ha confrontato [Compiler API TypeScript](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API), [ts-morph](https://ts-morph.com/setup/adding-source-files), [Tree-sitter](https://tree-sitter.github.io/tree-sitter/using-parsers/), [SCIP](https://github.com/scip-code/scip) e [LSP](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/). Compiler API e ts-morph coprono JS/TS; Tree-sitter permette un motore comune con grammatiche specifiche. Il bundle [Repomix](https://github.com/repomix/tree-sitter-wasms) e il runtime sono fissati nel lockfile e verificati insieme. La build desktop include motore, grammatiche selezionate, librerie TypeScript e licenze. Kotlin/Scala usano grammatiche con ABI precedente, isolate nel runtime compatibile; non vengono caricate nel runtime moderno.

La risoluzione semantica riusa gli strumenti dei linguaggi e ne normalizza l'output. [SCIP documenta](https://sourcegraph.com/docs/code-navigation/precise-code-navigation) indicizzatori per JS/TS, Python, Java/Kotlin/Scala, C#, C/C++, Go, Rust e Ruby; il repository del protocollo elenca anche PHP e Dart. M4.3 verifica i primi produttori TypeScript e Python. Gli altri restano candidati da collaudare per precisione, build, dipendenze, licenze e capacità; per Swift va valutato SourceKit-LSP. Un indice SCIP può essere elaborato localmente: l'adozione del formato aperto non richiede il servizio ospitato Sourcegraph.

M4.2 riprende il criterio conservativo degli [exact rename di Git](https://git-scm.com/docs/git-diff): il tool applica confronti locali del contenuto e non esegue Git sul repository importato. L’invalidazione è per file sintattico e, nel compilatore integrato, segue anche i cambiamenti dei contratti e delle dipendenze, come nei [progetti incrementali TypeScript](https://www.typescriptlang.org/docs/handbook/project-references.html). Queste scelte riusano pattern deterministici e non richiedono inferenza.

La copertura sintattica e semantica resta quella dichiarata: nuovi framework e backend esterni richiedono collaudi propri. M5 aggiungerà provider IA per interpretazioni residue e implementazione assistita, con output validati e benchmark separato. Non occorre un modello per leggere dichiarazioni, calcolare hash o renderizzare diagrammi.

Il vantaggio atteso di questa base è l'assenza di costi per token e di latenza di rete durante l'importazione; rimangono costi di calcolo, aggiornamento delle grammatiche e integrazione. Le misure su Redux/Click/Chi sono nel verbale M4. Non è stato effettuato un confronto con OpenAI/Claude; soglie su monorepo, precisione semantica su codice arbitrario e costi complessivi richiedono campioni ulteriori.

## Compilatore integrato, perimetro e rinomine dalla CLI

`--typescript` abilita lo stesso compilatore JS/TS del desktop. Legge la configurazione e i moduli disponibili nel perimetro, senza emettere codice, caricare plugin o eseguire script. Le librerie standard sono incluse nella build. Gli `extends` fuori dall'inventario non vengono caricati; riferimenti di progetto, ambienti mancanti e dipendenze installate restano limiti da valutare con le diagnostiche. Le diagnostiche del compilatore sono conservate in `analysis.compilerDiagnostics`; non trasformano la struttura recuperabile in una certificazione di compilazione riuscita. L'importazione delle dipendenze rappresentate resta basata su definizioni e intervalli esatti. La cache riusa AST/documenti, mantenendo simboli SCIP stabili rispetto agli spostamenti di offset. Un riavvio perde la cache semantica in memoria; gli AST estratti e le evidenze persistono nello snapshot.

```sh
node ade/code-import/cli.mjs SOURCE NEW_OUTPUT PROJECT_ID --typescript --scope /tmp/scope.json
node ade/code-import/cli.mjs status PREVIOUS --typescript --renames /tmp/renames.json
node ade/code-import/cli.mjs sync PREVIOUS NEW_OUTPUT --typescript --renames /tmp/renames.json
```

`scope.json` ha questa forma; i valori omessi non vengono completati implicitamente:

```json
{
  "include": ["src/**", "include/**"],
  "exclude": ["generated/", "**/*.generated.ts"],
  "excludedDirectories": [".git", ".ade", "node_modules", "vendor", "dist", "out", "target", ".venv"],
  "respectGitignore": true,
  "languageOverrides": { ".h": "cpp" }
}
```

Per includere sorgenti chiamati `build`, rimuovere `build` da `excludedDirectories` e verificare le regole Git applicabili. Cambiare il perimetro invalida la cache e richiede un'anteprima completa. `renames.json` è un array di `{ "fromId": "ID_PRECEDENTE", "toSourceId": "CHIAVE_SORGENTE_CORRENTE" }`; le chiavi correnti si ricavano da una nuova analisi e gli ID precedenti dall'indice salvato. Non usare nomi o somiglianze come sostituti delle identità.

Per collegare SCIP al desktop dopo una modifica, creare una nuova importazione CLI temporanea con lo stesso perimetro, catturare il produttore su quella revisione e selezionare il bundle tramite **Attach SCIP Bundles**. L'hash della revisione dipende da perimetro e file, non dall'ID del progetto; un bundle della stessa radice/revisione può quindi essere associato alle identità native attraverso gli intervalli delle definizioni. I percorsi dei bundle scelti restano soltanto nella sessione della finestra; dopo un riavvio vanno riselezionati al prossimo aggiornamento esterno.
