# Architettura

A.D.E è un fork dei sorgenti Code OSS: il workbench e l’applicazione desktop sono modificabili direttamente nella radice. Vedi [ADR 0001](decisions/0001-code-oss-fork.md) e [guida di sviluppo](fork-development.md). L’estensione iniziale è conservata come prototipo separato.

## Obiettivo

Usare un modello del software per navigare struttura, comportamenti e interazioni e, progressivamente, trasformare modifiche visuali in modifiche implementative verificabili.

## Moduli del prototipo (`ade/prototype/`)

- `src/model.js`: validazione e rendering del modello versione 1, separati dalle API VS Code.
- `src/extension.js`: comando e ciclo di vita della vista, lettura dei documenti e aggiornamenti.
- `examples/`: modelli di esempio versionabili.
- `test/`: controlli del modello e della gestione dei contenuti.

## Evoluzione prevista

Separare modello semantico, layout dei diagrammi e collegamenti al codice. Ogni elemento avrà un identificatore stabile. Le viste di classe, sequenza, attività e stato condivideranno gli elementi semantici senza confondere una vista con l'intero programma.

Per l'editing usare un custom editor VS Code per integrare salvataggio e undo/redo. Per la generazione iniziale limitarsi a un sottoinsieme dichiarato di TypeScript e mostrare un diff prima di applicare cambiamenti. La sincronizzazione bidirezionale arbitraria resta un problema aperto: il codice non rappresentabile nel modello deve essere conservato, con conflitti espliciti.

Il prototipo attuale non esegue codice del workspace, non carica risorse remote e non abilita script nella webview.

## Architettura obiettivo A.D.E

Il riferimento di prodotto è [la visione](vision.md). Il modello condiviso deve rappresentare feature, attori, componenti, risorse, viste, controller, contratti, flussi e vincoli con identificatori stabili. Il layout appartiene alle singole viste, mentre la semantica è condivisa.

Componenti previsti, non ancora implementati:

- Grafo semantico: elementi, relazioni, requisiti e collegamenti alle implementazioni.
- Esploratore: navigazione dal sistema al dettaglio, proprietà, dipendenze e impatto delle modifiche.
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
