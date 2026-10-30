# Importazione del codice e Sync — M4.1/M4.2

M4.1 introduce una base deterministica multilinguaggio in `ade/code-import/`, eseguibile con Node senza Electron, account IA o servizi remoti. Legge dichiarazioni sintattiche con Tree-sitter e genera un modello v3 apribile dal workbench esistente, più un indice delle evidenze. M4.2 aggiunge cache delle estrazioni, stato delle modifiche e Sync su richiesta verso una nuova versione recuperabile. L'importazione dalla home, il pulsante Sync nativo e la risoluzione semantica delle dipendenze restano incrementi successivi di M4; l'integrazione IA appartiene a M5.

## Esecuzione

Usare Node dalla `.nvmrc`, poi dalla radice:

```sh
npm --prefix ade/code-import ci --ignore-scripts
npm --prefix ade/code-import run check
npm --prefix ade/code-import test
node ade/code-import/cli.mjs ade/examples/code-import /tmp/ade-code-import-demo checkout-import
```

La cartella di destinazione deve essere nuova, con il genitore già esistente, e fuori dal sorgente. Se `/tmp/ade-code-import-demo` esiste, scegliere un altro nome. Il comando non sovrascrive file esistenti. Aprire `/tmp/ade-code-import-demo/model.ade.json` tramite **A.D.E: Open Project**; System Map espone cartelle, moduli e dichiarazioni, mentre ogni file ha un diagramma strutturale. `code-index.json` conserva linguaggio, diagnostiche, dichiarazioni, intestazioni, import e posizioni delle evidenze. `import-state.json` contiene la proiezione generata usata come baseline; `snapshot.json` marca un salvataggio completato e verifica l'integrità di stato e indice. Il modello resta modificabile. Gli snapshot possono essere spostati come cartelle complete; conservano il percorso assoluto canonico del sorgente e i percorsi relativi delle evidenze. Lo spostamento dell'intera radice sorgente richiede una nuova importazione. Non sono ancora presenti navigazione diretta dal diagramma al sorgente o un lettore nativo dell'indice.

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

La cache usa identità di progetto/radice, versione dell'adattatore e hash del contenuto; non si affida alle sole date di modifica. I file invariati non sono riparsati. Uno spostamento mantiene ID di modulo, dichiarazioni e diagramma soltanto quando esistono una cancellazione e un'aggiunta dello stesso contenuto/dialetto, con una sola corrispondenza in ciascun inventario completo. È una continuità di contenuto, non una prova dell'intento Git o del comportamento; copie e corrispondenze multiple non acquisiscono gli ID dell'originale. I nuovi percorsi vengono associati a chiavi sorgenti aggiornate, così una modifica successiva conserva l'identità spostata; riutilizzare il vecchio percorso alloca un'identità distinta. Le rinomine dei soli simboli e gli spostamenti accompagnati da modifiche non sono ancora riconciliati.

Sync confronta baseline generata, modello salvato dall'utente e nuova proiezione. Conserva annotazioni, contratti comportamentali manuali, relazioni, posizioni e nodi nascosti quando compatibili con il cambiamento sorgente. Nuovi nodi non spostano quelli esistenti. Modifiche concorrenti allo stesso campo, cancellazioni di elementi modificati manualmente, riferimenti manuali divenuti invalidi, sorgenti parziali, overload modificati o spostamenti ambigui bloccano il risultato: il report contiene i conflitti e nessuna versione viene pubblicata. L'exit code è `2` per conflitti, `1` per errori di esecuzione/input, `0` per un risultato valido; `status` usa gli stessi codici senza scrivere snapshot. La riconciliazione bidirezionale e la risoluzione interattiva dei conflitti restano in M6.

Gli input persistiti vengono validati con JSON Schema tramite Ajv, più i controlli di dominio M1, manifest, chiavi sorgenti e coerenza della proiezione. Prima del marcatore finale il tool ricontrolla il sorgente e, in Sync, i byte della versione precedente. Annullamento con Ctrl+C, errori e revisioni superate non aggiornano la baseline precedente; le scritture incomplete vengono rimosse quando l'errore è gestibile. Un arresto forzato può lasciare una cartella senza marcatore, che il lettore rifiuta. Ogni artifact è limitato a 64 MiB. I controlli di integrità rilevano modifiche accidentali e file mescolati, non sono firme crittografiche. La verifica di freschezza è ottimistica: non blocca altri editor e non sostituisce lo snapshot atomico del filesystem o la gestione documentale nativa.

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

Classi, moduli e contenitori diventano componenti, funzioni/metodi diventano azioni e interfacce/alias riconosciuti diventano contratti. È una proiezione strutturale, non un'attribuzione di responsabilità o feature. Le intestazioni, e il testo completo dei contratti di tipo, sono estratti dal sorgente: non sono input/output, precondizioni o criteri di accettazione già normalizzati nel contratto comportamentale M3. I membri delle interfacce restano dentro il contratto; non vengono trasformati in implementazioni.

Il contenimento usa l'annidamento sintattico, non la risoluzione dei tipi. Per esempio, un metodo Go con receiver resta nel modulo e un blocco `impl` Rust è un contenitore distinto dalla struct. Package, namespace, estensioni e tipi parziali non vengono unificati semanticamente. Overload e omonimie nello stesso contenitore hanno ID distinti e una diagnostica: il loro ordine non costituisce prova di continuità. Dichiarazioni anonime o con nomi calcolati non rappresentabili producono `unnamedDeclaration`.

Ogni file riporta conteggi per i tipi sintattici visitati, anche non proiettati. Import/include/use riconosciuti sono conservati come evidenze testuali, con destinazione non risolta. `require` Ruby, macro, chiamate e altri costrutti elencati dal profilo sono segnalati come `unresolvedConstruct`, aggregati per tipo con conteggio e prima posizione. Il modello non contiene archi di invocazione/dipendenza ricavati per somiglianza dei nomi. La lista di diagnostiche non è una classificazione esaustiva di tutti i costrutti non proiettati.

Errori di parsing rendono il file `partial`; le dichiarazioni recuperabili possono restare disponibili, con diagnostiche e posizioni nell'indice. Kotlin, Scala, Visual Basic, SQL, shell e altri formati riconosciuti senza adattatore sono `unsupported`. Le estensioni sconosciute sono `unclassified`, mai certificate come non sorgenti. `.h` usa il parser C: gli header C++ richiedono `.hpp` oppure una futura selezione esplicita. Vue/Svelte e altri file con linguaggi incorporati richiedono profili dedicati.

## Evidenze, identità e limiti

Gli hash SHA-256 sono calcolati sul testo letto in UTF-8. Ogni dichiarazione conserva file relativo, hash, intervallo UTF-16 con fine esclusa e righe a partire da 1. Le mappature M1 registrano lo stesso hash; il manifest d'importazione è un hash dei percorsi/stati/revisioni, non un commit Git né una verifica runtime. Identità di progetto, percorso relativo, contenimento sintattico, tipo e nome della dichiarazione determinano le chiavi sorgenti. Gli ID persistiti mantengono anche la continuità dei file spostati nei casi descritti sopra. Cambi di formattazione e di firma mantengono l'ID nei casi non ambigui; rinominare un simbolo non implica automaticamente continuità. Progetti distinti devono usare identificatori distinti.

L'inventario è ordinato, non segue link simbolici e registra le directory escluse: `.git`, `.ade`, `node_modules`, `vendor`, `dist`, `build`, `out`, `target`, `bin`, `obj`, `__pycache__`, `.venv`, `venv`, `.next`, `.build`. Non applica ancora `.gitignore` o annotazioni per file generati: anche directory sorgenti chiamate `build` vengono escluse e devono essere considerate nella scelta del perimetro. Il limite è 10.000 voci visitate e 2 MiB per sorgente; file troppo grandi sono segnalati, un inventario oltre il limite fallisce senza produrre un risultato incompleto presentato come riuscito. L'analisi verifica gli hash di tutti i sorgenti supportati nel perimetro, ma rianalizza soltanto la sintassi dei file invalidati. Per formati non supportati o sconosciuti l'inventario confronta percorsi e stati, senza leggerne il contenuto. Gli adattatori semantici futuri dovranno invalidare anche le dipendenze interessate; M4.2 non dichiara disponibile questo grafo.

Parser e alberi sono rilasciati dopo l'uso; le grammatiche WASM sono caricate una volta per processo. Non si eseguono sorgenti, script di installazione del progetto importato o build. Le sole scritture della CLI sono nella nuova cartella di output; `status` è in sola lettura. Il modello della versione precedente resta intatto anche in caso di conflitto.

## Scelta tecnica e prossimi adattatori

La ricerca del 30 ottobre 2026 ha confrontato [Compiler API TypeScript](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API), [ts-morph](https://ts-morph.com/setup/adding-source-files), [Tree-sitter](https://tree-sitter.github.io/tree-sitter/using-parsers/), [SCIP](https://github.com/scip-code/scip) e [LSP](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/). Compiler API e ts-morph coprono JS/TS; Tree-sitter permette un motore comune con grammatiche specifiche. Il bundle [Repomix](https://github.com/repomix/tree-sitter-wasms) e il runtime sono fissati nel lockfile e verificati insieme. Licenze e provenienza delle singole grammatiche vanno conservate nella futura distribuzione del desktop; M4.1 le usa come dipendenze locali del tool separato.

La risoluzione semantica deve riusare gli strumenti dei linguaggi e normalizzarne l'output. [SCIP documenta](https://sourcegraph.com/docs/code-navigation/precise-code-navigation) indicizzatori per JS/TS, Python, Java/Kotlin/Scala, C#, C/C++, Go, Rust e Ruby; il repository del protocollo elenca anche PHP e Dart. Per Swift va valutato SourceKit-LSP. Sono candidati, non integrazioni già disponibili o equivalenti per qualità. Build, dipendenze, licenze e capacità vanno verificati per ogni adattatore. Un indice SCIP può essere elaborato localmente: l'adozione del formato aperto non richiede il servizio ospitato Sourcegraph.

M4.2 riprende il criterio conservativo degli [exact rename di Git](https://git-scm.com/docs/git-diff): il tool applica confronti locali del contenuto e non esegue Git sul repository importato. L'invalidazione è oggi per file sintattico; l'analisi semantica dovrà seguire anche i cambiamenti dei contratti e delle dipendenze, come avviene nei [progetti incrementali TypeScript](https://www.typescriptlang.org/docs/handbook/project-references.html). Queste scelte riusano pattern deterministici e non richiedono inferenza.

I prossimi incrementi M4 comprendono configurazione del perimetro, profili Kotlin/Scala, importazione dell'indice semantico, navigazione sorgente e Sync nativi e continuità delle rinomine di simboli dimostrata dagli adattatori. M5 aggiungerà provider IA per interpretazioni residue e implementazione assistita, con output validati e benchmark separato. Non occorre un modello per leggere dichiarazioni, calcolare hash o renderizzare diagrammi.

Il vantaggio atteso di questa base è l'assenza di costi per token e di latenza di rete durante l'importazione; rimangono costi di calcolo, aggiornamento delle grammatiche e integrazione. Non sono stati misurati confronti con OpenAI/Claude: precisione semantica, prestazioni su repository grandi e costi complessivi richiedono benchmark rappresentativi prima di dichiarare soglie.
