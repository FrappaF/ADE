# Importazione del codice — M4.1

M4.1 introduce una base deterministica multilinguaggio in `ade/code-import/`, eseguibile con Node senza Electron, account IA o servizi remoti. Legge dichiarazioni sintattiche con Tree-sitter e genera un modello v3 apribile dal workbench esistente, più un indice delle evidenze. L'importazione dal pulsante della home, la risoluzione semantica delle dipendenze e Sync restano incrementi successivi di M4; l'integrazione IA appartiene a M5.

## Esecuzione

Usare Node dalla `.nvmrc`, poi dalla radice:

```sh
npm --prefix ade/code-import ci --ignore-scripts
npm --prefix ade/code-import run check
npm --prefix ade/code-import test
node ade/code-import/cli.mjs ade/examples/code-import /tmp/ade-code-import-demo checkout-import
```

La cartella di destinazione deve essere nuova, con il genitore già esistente, e fuori dal sorgente. Se `/tmp/ade-code-import-demo` esiste, scegliere un altro nome. Il comando non sovrascrive file esistenti. Aprire `/tmp/ade-code-import-demo/model.ade.json` tramite **A.D.E: Open Project**; System Map espone cartelle, moduli e dichiarazioni, mentre ogni file ha un diagramma strutturale. `code-index.json` conserva linguaggio, diagnostiche, dichiarazioni, intestazioni, import e posizioni delle evidenze. I due file possono essere spostati insieme; i percorsi del sorgente sono relativi alla cartella analizzata. M4.1 non aggiunge ancora navigazione diretta dal diagramma al sorgente o un lettore nativo dell'indice.

L'esempio è un insieme di sorgenti TypeScript, Python e Java indipendenti, non un'applicazione distribuita eseguibile. La presenza di nomi simili non dimostra comunicazione fra servizi: nessun collegamento viene inventato.

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

Classi, moduli e contenitori diventano componenti, funzioni/metodi diventano azioni e interfacce/alias riconosciuti diventano contratti. È una proiezione strutturale, non un'attribuzione di responsabilità o feature. Le intestazioni sono testo estratto, non input/output, precondizioni o criteri di accettazione già normalizzati nel contratto comportamentale M3. I membri delle interfacce restano dentro il contratto; non vengono trasformati in implementazioni.

Il contenimento usa l'annidamento sintattico, non la risoluzione dei tipi. Per esempio, un metodo Go con receiver resta nel modulo e un blocco `impl` Rust è un contenitore distinto dalla struct. Package, namespace, estensioni e tipi parziali non vengono unificati semanticamente. Overload e omonimie nello stesso contenitore hanno ID distinti e una diagnostica: il loro ordine non costituisce prova di continuità. Dichiarazioni anonime o con nomi calcolati non rappresentabili producono `unnamedDeclaration`.

Ogni file riporta conteggi per i tipi sintattici visitati, anche non proiettati. Import/include/use riconosciuti sono conservati come evidenze testuali, con destinazione non risolta. `require` Ruby, macro, chiamate e altri costrutti elencati dal profilo sono segnalati come `unresolvedConstruct`, aggregati per tipo con conteggio e prima posizione. Il modello non contiene archi di invocazione/dipendenza ricavati per somiglianza dei nomi. La lista di diagnostiche non è una classificazione esaustiva di tutti i costrutti non proiettati.

Errori di parsing rendono il file `partial`; le dichiarazioni recuperabili possono restare disponibili, con diagnostiche e posizioni nell'indice. Kotlin, Scala, Visual Basic, SQL, shell e altri formati riconosciuti senza adattatore sono `unsupported`. Le estensioni sconosciute sono `unclassified`, mai certificate come non sorgenti. `.h` usa il parser C: gli header C++ richiedono `.hpp` oppure una futura selezione esplicita. Vue/Svelte e altri file con linguaggi incorporati richiedono profili dedicati.

## Evidenze, identità e limiti

Gli hash SHA-256 sono calcolati sul testo letto in UTF-8. Ogni dichiarazione conserva file relativo, hash, intervallo UTF-16 con fine esclusa e righe a partire da 1. Le mappature M1 registrano lo stesso hash; il manifest d'importazione è un hash dei percorsi/stati/revisioni, non un commit Git né una verifica runtime. Identità di progetto, percorso relativo, contenimento sintattico, tipo e nome della dichiarazione determinano gli ID. Cambi di formattazione e di firma mantengono l'ID nei casi non ambigui; rinomine e spostamenti non sono ancora riconciliati. Progetti distinti devono usare identificatori distinti.

L'inventario è ordinato, non segue link simbolici e registra le directory escluse: `.git`, `.ade`, `node_modules`, `vendor`, `dist`, `build`, `out`, `target`, `bin`, `obj`, `__pycache__`, `.venv`, `venv`, `.next`, `.build`. Non applica ancora `.gitignore` o annotazioni per file generati: anche directory sorgenti chiamate `build` vengono escluse e devono essere considerate nella scelta del perimetro. Il limite è 10.000 voci visitate e 2 MiB per sorgente; file troppo grandi sono segnalati, un inventario oltre il limite fallisce senza produrre un risultato incompleto presentato come riuscito. M4.1 assume un albero locale stabile durante la lettura; non è uno snapshot atomico di file modificati contemporaneamente.

Parser e alberi sono rilasciati dopo l'uso; le grammatiche WASM sono caricate una volta per processo. Non si eseguono sorgenti, script di installazione del progetto importato o build. Le sole scritture della CLI sono nella nuova cartella di output; un errore durante il salvataggio rimuove quella cartella. L'analisi rilegge tutto il perimetro a ogni esecuzione: il caricamento condiviso delle grammatiche non equivale a Sync incrementale. Nessun modello esistente, layout o annotazione viene riconciliato o sostituito.

## Scelta tecnica e prossimi adattatori

La ricerca del 30 ottobre 2026 ha confrontato [Compiler API TypeScript](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API), [ts-morph](https://ts-morph.com/setup/adding-source-files), [Tree-sitter](https://tree-sitter.github.io/tree-sitter/using-parsers/), [SCIP](https://github.com/scip-code/scip) e [LSP](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/). Compiler API e ts-morph coprono JS/TS; Tree-sitter permette un motore comune con grammatiche specifiche. Il bundle [Repomix](https://github.com/repomix/tree-sitter-wasms) e il runtime sono fissati nel lockfile e verificati insieme. Licenze e provenienza delle singole grammatiche vanno conservate nella futura distribuzione del desktop; M4.1 le usa come dipendenze locali del tool separato.

La risoluzione semantica deve riusare gli strumenti dei linguaggi e normalizzarne l'output. [SCIP documenta](https://sourcegraph.com/docs/code-navigation/precise-code-navigation) indicizzatori per JS/TS, Python, Java/Kotlin/Scala, C#, C/C++, Go, Rust e Ruby; il repository del protocollo elenca anche PHP e Dart. Per Swift va valutato SourceKit-LSP. Sono candidati, non integrazioni già disponibili o equivalenti per qualità. Build, dipendenze, licenze e capacità vanno verificati per ogni adattatore. Un indice SCIP può essere elaborato localmente: l'adozione del formato aperto non richiede il servizio ospitato Sourcegraph.

I prossimi incrementi M4 comprendono configurazione del perimetro, profili Kotlin/Scala, importazione dell'indice semantico, navigazione sorgente nativa, cache e Sync su richiesta, impatto preliminare e continuità dimostrabile di rinomine/spostamenti. M5 aggiungerà provider IA per interpretazioni residue e implementazione assistita, con output validati e benchmark separato. Non occorre un modello per leggere dichiarazioni, calcolare hash o renderizzare diagrammi.

Il vantaggio atteso di questa base è l'assenza di costi per token e di latenza di rete durante l'importazione; rimangono costi di calcolo, aggiornamento delle grammatiche e integrazione. Non sono stati misurati confronti con OpenAI/Claude: precisione semantica, prestazioni su repository grandi e costi complessivi richiedono benchmark rappresentativi prima di dichiarare soglie.
