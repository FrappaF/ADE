# Canvas e cambio progetto

Il diagramma occupa tutta l’area dell’editor. La sidebar non si apre automaticamente: **Diagrams** sceglie la vista con un selettore; **Actions → More Tools → Diagram Navigation** riapre la navigazione laterale quando serve.

Il piccolo menu in alto contiene **Open Project**, **Diagrams**, **Spread Out** e **Actions**. Nei progetti importati restano direttamente accessibili **Update Code**, **Chat with Codex** e **Update Diagrams**. Salvataggio, aggiunta di elementi, opzioni del diagramma, configurazione IA e strumenti tecnici si trovano in **Actions**. Le proprietà sono un pannello sovrapposto compatto, aperto selezionando un elemento o una relazione (anche un messaggio di sequenza); **Esc** o la croce lo chiudono senza ridimensionare il canvas.

## Navigazione

- Trascinare lo sfondo per spostare la vista; Alt + trascinamento o il pulsante centrale funzionano anche sopra gli elementi.
- Scorrere per spostarsi; Ctrl/Command + scorrimento cambia lo zoom mantenendo fermo il punto sotto il cursore.
- I pulsanti in basso cambiano zoom; **Fit Diagram** inquadra il diagramma.
- Con lo sfondo focalizzato, le frecce spostano la vista e Home inquadra il diagramma. Con un elemento focalizzato, le frecce spostano l’elemento, anche a coordinate negative; queste modifiche usano l’undo del documento.
- Pan e zoom non modificano il modello. La posizione della vista viene ricordata per progetto e diagramma.

**Spread Out** distribuisce gli elementi in modo più arioso, raggruppando anche i cicli su più righe e colonne. È una modifica annullabile. Le nuove viste generate dall’IA usano questa disposizione; gli aggiornamenti preservano le posizioni esistenti. Le relazioni restano presenti, ma le etichette compaiono quando si passa sopra una connessione o si seleziona un elemento/relazione. **Actions → Show Relationship Labels** mostra tutte le etichette.

## Aprire un altro progetto

**Open Project** è sempre visibile sul canvas. Anche **File → Open Folder** segue la cartella appena aperta: ripristina `.ade/model.json` o lo snapshot attivo di `.ade/code-project.json`. Una cartella senza progetto mostra Home con il percorso corrente e le azioni per aprire, creare o importare, senza conservare i diagrammi del progetto precedente.

L’aggiunta di una cartella a un workspace con più root conserva il progetto attivo se è ancora presente. Se viene rimossa la root del progetto, ADE chiede di salvare o scartare le modifiche prima del passaggio. Annullando, mantiene il documento non salvato e mostra uno stato di recupero; **Retry** ripropone il passaggio. Lo stato copiato da un altro workspace non ripristina un modello estraneo alla cartella corrente.

## Verifica

La prova desktop `node ade/scripts/smoke-desktop.mjs --canvas-only` usa un esempio di 17 elementi e 32 dipendenze. Controlla l’area occupata dal canvas, pan, zoom ancorato al puntatore, selezione senza salto di vista, proprietà fluttuanti, modifica da tastiera con undo, ripristino della vista al riavvio, selezione dei messaggi di sequenza, adattamento dei pannelli in una finestra stretta e il comando nativo **File → Open Folder** verso un progetto diverso e una cartella vuota. Screenshot e risultati vengono scritti in `.build/ade-smoke/infinite-canvas*` e `workspace-switched-empty.png`.

Il servizio progetto è verificato nel runner Electron con `scripts/test.sh --run src/vs/workbench/contrib/ade/test/browser/adeProjectService.test.ts`; la geometria del canvas e la disposizione sono verificate dai test `ade/test/diagram-camera.test.mjs` e `ade/test/diagram-layout.test.mjs`. Il flusso IA completo usa una CLI simulata nella prova `--diagram-workflow`.
