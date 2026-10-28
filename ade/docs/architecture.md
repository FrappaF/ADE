# Architettura

A.D.E è un fork dei sorgenti Code OSS: il workbench e l’applicazione desktop sono modificabili direttamente nella radice. Vedi [ADR 0001](decisions/0001-code-oss-fork.md) e [guida di sviluppo](fork-development.md). L’estensione iniziale è conservata come prototipo separato.

L'[ADR 0002](decisions/0002-visual-workbench.md) definisce la trasformazione del workbench in un IDE centrato su diagrammi e flussi: sidebar sistema → feature → diagrammi, canvas principale, proprietà contestuali e strumenti tecnici come viste secondarie su richiesta. L'interfaccia definitiva viene implementata nei contributi e servizi nativi del fork. L'esecuzione del prodotto non richiede il caricamento di `ade/prototype/`.

## Obiettivo

Usare un modello del software per navigare struttura, comportamenti e interazioni e, progressivamente, trasformare modifiche visuali in modifiche implementative verificabili.

## Moduli del prototipo (`ade/prototype/`)

- `src/model.js`: validazione e rendering del modello versione 1, separati dalle API VS Code.
- `src/extension.js`: comando e ciclo di vita della vista, lettura dei documenti e aggiornamenti.
- `examples/`: modelli di esempio versionabili.
- `test/`: controlli del modello e della gestione dei contenuti.

## Modello semantico e shell nativa (M1)

Il [contratto v2](semantic-model.md) separa semantica, proiezioni visuali, mappature al codice e record di verifica. `src/vs/workbench/contrib/ade/common/semanticModel.ts` implementa tipi, schema, validatore, migrazione e `SemanticModelService` senza dipendenze da Electron, Node o browser. I test in `ade/test/` lo eseguono direttamente con Node. Gli identificatori sono indipendenti da nomi, contenitori e coordinate.

`browser/ade.contribution.ts` registra l’editor nativo della home A.D.E, i comandi `ade.showHome` e `ade.workbench.open`, il resolver e il percorso di avvio. `browser/adeInput.ts` definisce l’identità persistente dell’editor; `browser/adeEditor.ts` implementa la shell e il consumo del servizio M1. La shell legge i documenti tramite `IFileService`, li valida con lo stesso servizio di dominio, segue gli aggiornamenti con watcher correlato e conserva navigazione e selezione tramite `IStorageService`. Non scrive modelli e non implementa ancora il canvas. Lo smoke desktop sul MacBook è stato confermato dall’utente; dettagli e verifiche aggiuntive nel [verbale M0](m0-verification.md).

M2.1 riprogetta avvio, sidebar e layout dell'intero workbench; M2.2 integra canvas strutturale e di flusso con i servizi nativi di documenti, salvataggio e undo/redo, partendo dalla creazione di un nuovo progetto e delle sue feature. La selezione di un diagramma nella sidebar usa l'identità della vista M1 e ne mantiene distinto il contenitore semantico. Se il formato v2 non basta a esprimere associazioni fra feature e viste, introdurre un'evoluzione versionata e la relativa migrazione prima dell'editing persistente.

L'accesso a un simbolo sorgente, quando esiste una mappatura, avviene tramite i servizi editor come vista secondaria e conserva feature, diagramma e selezione al ritorno. Terminale e debugger mantengono i servizi upstream, con visibilità su richiesta. Un nuovo progetto può esistere come intento progettuale senza codice generato.

Per la generazione iniziale limitarsi a un sottoinsieme dichiarato di TypeScript e mostrare un diff prima di applicare cambiamenti. La sincronizzazione bidirezionale arbitraria resta un problema aperto: il codice non rappresentabile nel modello deve essere conservato, con conflitti espliciti.

Il prototipo attuale non esegue codice del workspace, non carica risorse remote e non abilita script nella webview.

## Architettura obiettivo A.D.E

Il riferimento di prodotto è [la visione](vision.md). Il modello condiviso deve rappresentare feature, attori, componenti, risorse, viste, controller, contratti, flussi e vincoli con identificatori stabili. Il layout appartiene alle singole viste, mentre la semantica è condivisa.

Stato dei componenti:

- Grafo semantico M1 implementato: elementi, relazioni, comportamenti, layout separato e record di implementazione/verifica. Analisi effettiva del codice e test appartengono alle milestone successive.
- Shell iniziale implementata: home, selezione elementi, relazioni e proprietà; esplorazione coordinata, ricerca e impatto delle modifiche previsti in M3.
- Adattatori tecnologici: analisi della codebase e trasformazioni verso linguaggi e framework supportati.
- Coordinatore IA: pianificazione, modifica e verifica a partire dagli intenti del developer.
- Motore di riconciliazione: confronto fra versione comune, modello modificato e codice modificato.
- Verifica e tracciabilità: test, diagnostica, provenienza delle modifiche e ripristino.

### Ciclo di riconciliazione

1. Rilevare una modifica e registrarne origine, revisione e ambito.
2. Calcolare l'impatto sul grafo e confrontare modello e codice con la revisione comune.
3. Derivare una trasformazione tramite adattatore; usare l'IA quando serve interpretazione.
4. Rilevare cambiamenti concorrenti, conflitti e costrutti non rappresentabili.
5. Applicare la modifica in modo recuperabile ed eseguire le verifiche pertinenti.
6. Aggiornare le viste e la revisione comune soltanto dopo riconciliazione riuscita.

Gli stati esposti saranno almeno: allineato, modifica in attesa, riconciliazione in corso, conflitto e verifica fallita. Identificatori di operazione e revisioni impediranno che gli aggiornamenti generati riattivino cicli infiniti. Una modifica a un commento o al layout non deve produrre una riscrittura semantica del sistema.

L'indipendenza dai framework è un obiettivo dell'interfaccia e del modello: ogni adattatore deve dichiarare le capacità supportate. Non si presume che sia possibile convertire automaticamente qualsiasi programma in qualsiasi tecnologia.
