# Accessibilità del workbench visuale

M2.3 offre una lettura testuale del modello attraverso **Accessible View**, il lettore nativo di Code OSS. Non apre il JSON e non modifica il documento.

## Lettura e aiuto

Con il focus nel canvas, nei suoi controlli o nella sidebar **System and Features**, usare **Open Accessible View** dalla palette comandi. Nei diagrammi il pulsante **Read Diagram** apre lo stesso lettore. **Open Accessibility Help** descrive navigazione, editing, opzioni, recupero e strumenti tecnici. Le scorciatoie native predefinite sono:

| Azione | Linux | macOS |
| --- | --- | --- |
| Lettura del diagramma | Alt+Shift+F2 | Option+F2 |
| Aiuto contestuale | Alt+Shift+F1 | Option+F1 |
| Ritorno al controllo precedente | Escape | Escape |

I suggerimenti nell'interfaccia e l'aiuto risolvono le associazioni effettive dell'utente; non assumono che una scorciatoia predefinita sia ancora assegnata. La palette rimane disponibile quando una combinazione non è assegnata o viene gestita dal sistema operativo.

La lettura include sistema, feature proprietaria quando determinabile, elementi del diagramma, relazioni, condizioni ed errori. Per l'elemento selezionato comprende appartenenza, input/output e obbligatorietà, precondizioni, postcondizioni, errori dichiarati, autorizzazioni, criteri di accettazione e conteggi delle evidenze presenti. Le relazioni dell'elemento selezionato non disegnate nel diagramma vengono indicate separatamente.

La vista si aggiorna con il documento e la selezione, comprese le modifiche esterne. Se il documento diventa invalido, mostra l'errore al posto del vecchio diagramma; durante il caricamento segnala l'attesa. Home e progetti senza diagrammi hanno contenuti espliciti. Questi testi descrivono l'intento progettuale e non certificano esecuzione, importazione o verifiche del codice.

M3.1 estende la lettura a **Element Details**, incluse le identità non collocate in diagrammi e i diagrammi di una feature. **Read Element Details** e **A.D.E: Read Current Context** usano direttamente lo stesso provider e servizio nativi, così i pulsanti funzionano anche prima dell'attivazione del dispatcher accessibile generale durante l'avvio. L'aiuto descrive anche ricerca, breadcrumb, cambio di prospettiva e cronologia; i dettagli sono nella [guida all'esploratore](semantic-explorer.md).

Escape riporta al controllo di origine, anche quando un aggiornamento del modello ne ha sostituito il nodo DOM. Se il progetto o la superficie sono stati chiusi o sostituiti, il lettore evita di riportare il focus a controlli obsoleti. L'aiuto del terminale e degli altri strumenti continua a usare i rispettivi provider nativi.

## Suggerimenti configurabili

`accessibility.verbosity.ade` controlla i suggerimenti relativi ad aiuto e lettura testuale, è attivo inizialmente ed è modificabile nelle impostazioni. Disattivarlo non disabilita i comandi o il lettore. I suggerimenti si aggiornano anche quando l'utente cambia le associazioni dei tasti.

## Perimetro verificato

I test del contenuto verificano riferimenti, condizioni alternative, proprietà, evidenze dichiarate, contesti vuoti e stati di errore, senza scrivere il modello. Lo smoke Electron UX esercita i comandi nativi, il focus, gli aggiornamenti esterni e le impostazioni reali. Gli esiti sono registrati nel [verbale M2.3](m2-3-verification.md).

Il lettore nativo è un'integrazione tecnica per l'accessibilità; il collaudo con VoiceOver e una tastiera fisica macOS rimane aperto. La precedente prova di modalità screen reader forzata su Linux headless non viene equiparata a una sessione con tecnologia assistiva reale.

M3.2 estende ai contenuti di **System Map** lo stesso aiuto, lettore e impostazione di verbosità. I gruppi usano sezioni native, gli elementi sono pulsanti e i collegamenti aggregati usano disclosure native. **Read System Map** legge tutte le identità, la gerarchia, i diagrammi e le relazioni, incluse condizioni ed errori. Il focus torna al controllo originale dopo Escape; Back/Forward e il breadcrumb includono la mappa. Le frecce SVG restano decorative: Properties e il lettore conservano la semantica completa.

I gruppi sistema/feature recuperati dalla branch M2 usano disclosure native: Tab raggiunge il summary, Enter o Space cambia lo stato, salvato per documento. **Related Diagrams** conserva l’identità e il proprietario della vista. La selezione del canvas mantiene il DOM della sidebar; l’aiuto documenta anche la scorciatoia **Return to Model**, risolta tramite il registro nativo dei keybinding. I tipi dei diagrammi sono leggibili nel contesto e nel lettore; quelli degli elementi nella descrizione accessibile dei nodi.
