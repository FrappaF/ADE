# Anteprima UI/UX A.D.E

Prototipo interattivo della [roadmap delle correzioni](../../docs/manual-test-roadmap.md). Aprire `index.html` in un browser; non richiede installazione, rete o account. L’interfaccia e i dati sono dimostrativi: nessuna CLI viene avviata, nessun file del progetto viene letto o modificato e nessuna chiamata AI viene effettuata. Il prototipo non è l’interfaccia già integrata nell’app desktop.

Provare clic destro sui nodi e sulle relazioni, modifica delle proprietà, creazione di una dipendenza, Undo, densità di Disponi, zoom, Sync progetto, Files e Terminale. Il selettore «Stato AI» in alto mostra i casi collegato, CLI assente, accesso richiesto ed errore del provider. «Prepara implementazione» dimostra il feedback di avanzamento. Le altre azioni mostrano una spiegazione quando il comportamento non è implementato nella demo.

Le posizioni rappresentano tre esempi di densità; non costituiscono il nuovo algoritmo di layout o routing. I menu illustrano l’organizzazione proposta, mentre la validazione semantica definitiva resta nel prodotto. Le modifiche della demo vivono solo in memoria e si azzerano ricaricando la pagina. Il terminale mostra output statico. Le viste Flusso, Sequenza e Stati rimandano con un messaggio all’illustrazione Struttura.

La proposta mantiene il canvas al centro, separa le azioni del progetto da quelle della vista e sposta le azioni degli oggetti nei menu contestuali. Colori e dimensioni sono organizzati in variabili e ruoli coerenti con la [filosofia di design del repository](../../../.github/skills/design-philosophy/SKILL.md); le integrazioni definitive useranno servizi, componenti e token del workbench nativo.
