# Verifica M4.3 — Ponte semantico SCIP

Data: 30 ottobre 2026. Base: `6667d140` (M4.2); branch `feat/m4-code-bridge`. Ambiente: Linux x64, Node 24.22.1. Nessuna integrazione IA o modifica dei contributi UI/core.

## Risultati osservati

| Verifica | Esito |
| --- | --- |
| Typecheck mirato `npm --prefix ade/code-import run check` | Superato |
| Controllo sintattico CLI, cattura e produttore con `node --check` | Superato |
| `npm --prefix ade/code-import test` | 40 test superati: suite precedente e nuovi casi SCIP |
| Indicizzazione reale TypeScript | scip-typescript 0.6.0: 2 definizioni associate e 2 dipendenze nel campione |
| Indicizzazione reale Python | scip-python 0.6.8/Pyright: 2 definizioni associate e 2 dipendenze nel campione |
| Percorso completo con entrambi i produttori | Baseline → esecuzione reale → bundle → Sync → lettura/validazione dello snapshot: superato |
| `git diff --check` | Superato |

Gli indicizzatori sono stati installati separatamente in `/tmp`, con script di installazione disabilitati. Non sono state aggiunte dipendenze al pacchetto ADE, al renderer o alla radice. La suite CI usa [fixture documentate](../code-import/test/fixtures/scip/README.md) ricavate dai binari reali, senza richiedere quei tool; il percorso con esecuzione effettiva è stato collaudato separatamente in questa sessione, su sorgenti invariati e output temporanei rimossi al termine. La CI remota non è stata eseguita/osservata in questa sessione.

I casi positivi ricostruiscono un'importazione con alias (`charge` → `pay`) in entrambi i linguaggi, verificano i binding alle posizioni esatte dei nomi e la conservazione delle revisioni di definizioni/riferimenti. Il modello contiene un diagramma Code Dependencies e supera il contratto M1/M3. Parametri e variabili senza un corrispondente elemento ADE restano diagnostiche, senza essere associati alla funzione contenitrice come destinazioni.

Altri test coprono UTF-8/16/32 con caratteri supplementari, range compatti e tipizzati, wrapper JSON protobuf Go, precedenza dei range tipizzati, offset dentro un carattere, radici/percorsi errati, testo e revisioni superati, encoding mancante, schemi malformati, file non coperti, definizioni ambigue e relazioni di simbolo non rappresentate. Una prima esecuzione reale ha evidenziato il valore Proto3 `Document.text = ""` per testo omesso: il ponte lo gestisce esplicitamente e le fixture lo conservano per evitare regressioni.

La cattura rifiuta modifiche al sorgente prima/durante l'esecuzione del produttore. I test verificano invalidazione semantica dopo una modifica al package manifest, assenza di nuovo parsing dei sorgenti invariati, rifiuto della pubblicazione senza un indice aggiornato, migrazione degli snapshot M4.2 senza cambiare gli ID, aggiornamento delle dipendenze e conflitti quando una relazione modificata manualmente verrebbe rimossa. La CLI viene esercitata in sottoprocessi: cattura, status senza scritture, Sync con bundle e mantenimento dei byte della baseline precedente.

La struttura di ricerca dei contenitori usa un indice a intervalli; la validazione dei target usa insiemi indicizzati. Il calcolo dell'impatto evita richieste ripetute per gli stessi soggetti o per figli già compresi in una radice selezionata. Non sono stati pubblicati benchmark di prestazione o soglie su repository grandi.

## Limiti e seguito

Il formato comune è indipendente dal linguaggio; sono verificati due produttori reali, non tutti gli indicizzatori SCIP. C#/Java/C/C++/Go/Rust/PHP/Ruby e altri backend richiedono collaudi dedicati. La sintassi multilinguaggio di M4.1/M4.2 resta disponibile. I riferimenti sono statici e diventano dipendenze: non vengono dichiarate invocazioni/runtime, letture/scritture o correttezza del comportamento. Completezza e precisione dipendono dal produttore; diagnostiche e file coperti restano ispezionabili nell'indice.

Il comando di cattura deve eseguire un produttore fidato che rigeneri l'indice: i controlli sui manifest non possono dimostrare che un comando arbitrario non stia stampando dati vecchi. Il manifest verifica sorgenti e configurazioni riconosciute; dipendenze esterne, configurazioni non riconosciute e modifiche simultanee non bloccate dal filesystem restano limiti della verifica ottimistica. Il produttore Python dimostrativo analizza un ambiente pacchetti vuoto e non sostituisce la configurazione di un progetto reale.

L'indice semantico viene oggi rigenerato dal backend scelto dopo cambiamenti tracciati; solo la cache sintattica è selettiva per file. Restano configurazione del perimetro, altri backend, gestione semantica selettiva, rinomine dei simboli, navigazione sorgente/lettore delle evidenze e importazione/Sync nel workbench. Non sono stati eseguiti nuovi smoke desktop o collaudi macOS/Windows. M4 rimane aperta; IA e riconciliazione bidirezionale restano rispettivamente in M5 e M6.
