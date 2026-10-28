# ADR 0002 — Workbench A.D.E centrato su diagrammi e flussi

Stato: adottata su richiesta dell'utente, 28 ottobre 2026. Confermati sistema e feature al primo livello, strumenti tecnici come viste secondarie su richiesta e progettazione di un nuovo sistema come primo percorso.

## Decisione

A.D.E è un IDE desktop autonomo basato sui sorgenti Code OSS. La UI/UX viene riprogettata a livello di workbench: il percorso ordinario usa diagrammi e flussi come contesto principale, con accesso al codice per approfondimenti e manutenzione.

L'esperienza visuale è implementata nel prodotto nativo. `ade/prototype/` rimane un laboratorio storico separato; l'utente finale non installa un plugin e non deve avviare un Extension Development Host per utilizzare A.D.E.

## Gerarchia dell'esperienza

| Area | Responsabilità |
| --- | --- |
| Avvio e home | Creazione di un nuovo sistema come percorso prioritario, apertura e ripristino di un progetto; operazioni disponibili esplicite |
| Sidebar sinistra | Sistema e feature al primo livello, con i diagrammi pertinenti sotto ciascun elemento; componenti e risorse raggiungibili nel contesto semantico |
| Area centrale | Canvas e viste del sistema, con schede identificate dai diagrammi e percorsi di flusso |
| Proprietà contestuali | Responsabilità, contratti, comportamento e vincoli dell'elemento selezionato |
| Collaborazione e risultati | Piano IA, modifiche proposte ed evidenze nel contesto del modello, quando disponibili nelle milestone dedicate |
| Strumenti tecnici | Viste secondarie su richiesta per codice, file, terminale, debugger e Git; apertura e chiusura conservano il contesto visuale |

Diagramma ed elemento semantico sono identità distinte. Più diagrammi possono rappresentare gli stessi elementi, mentre posizioni e scelte di presentazione appartengono alle singole viste. La sidebar non deve diventare una semplice rappresentazione dei nomi dei file JSON.

## Stato e conseguenze

Il contributo M0/M1 attuale è nativo, ma si apre come editor dentro un workbench ancora impostato prevalentemente secondo Code OSS. Questo è un punto di partenza tecnico: non realizza ancora l'esperienza qui definita.

M2.1 progetta l'architettura dell'esperienza e modifica sidebar, avvio, area centrale e accesso agli strumenti. M2.2 implementa il canvas persistente nella nuova shell; M2.3 ne collauda l'intero percorso. M3 amplia esplorazione e viste coordinate senza ripristinare la navigazione per file come percorso ordinario.

Si riutilizzano i servizi upstream di file, documenti, salvataggio, undo/redo, temi, accessibilità e strumenti tecnici. Le modifiche di layout e navigazione rispettano i livelli del repository e restano inventariate per gli aggiornamenti upstream. L'editor testuale e il filesystem continuano a esistere come infrastruttura del progetto.

Il collaudo del prodotto deve includere un profilo pulito senza `--extensionDevelopmentPath`, apertura diretta del diagramma e ripristino del contesto. Lo smoke storico dell'Extension Host resta una verifica distinta.

## Primo percorso da realizzare

L'utente crea dalla home un nuovo progetto, aggiunge la prima feature e ne progetta struttura e flusso. Nella sidebar sceglie una feature e passa fra i suoi diagrammi; le proprietà seguono l'elemento selezionato. Salvataggio e ripristino non richiedono di modificare JSON o aprire sorgenti.

Il caso di collaudo è «Conferma acquisto», con percorso riuscito e pagamento rifiutato. Importazione della codebase, generazione IA ed esecuzione arrivano nelle rispettive milestone e non sono prerequisiti per progettare il sistema. Le viste tecniche non richiedono il passaggio a una modalità separata dell'IDE; un elemento solo progettato può non avere ancora una realizzazione nel codice.

I wireframe di M2.1 devono precisare organizzazione di componenti e risorse, interazioni di creazione e gestione dei diagrammi, spazi dedicati agli strumenti tecnici e comportamento su finestre strette, rispettando queste scelte.
