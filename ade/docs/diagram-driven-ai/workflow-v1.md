<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# Percorso visuale e preparazione continua v1

Contratto DAI-10 del 9 novembre 2026 (Europe/Rome), primo profilo Node ESM revisione 5. [Attesi prima dell'implementazione](dai-10-acceptance.md), [prove](dai-10.md), [ADR 0013](../decisions/0013-native-workflow-and-continuous-preparation.md).

## Percorso ordinario

1. Creare/aprire il progetto e aggiungere una feature. Il comando **Add Pure Quantity Feature** crea il primo modello eseguibile e dati indipendenti; **Edit Blueprint** permette di costruire scope C4, ownership, tipi e contratti. Gli editor dedicati aggiungono predicati, interazioni, stati e messaggi. Il progetto usa il documento nativo: salvataggio, undo/redo e riapertura conservano le identità.
2. Le proprietà espongono maturità calcolata, owner, binding, vincoli applicabili, provenienza e ragioni degli ignoti. I punti d'ingresso dipendono dal tipo selezionato. Le diagnostiche aprono direttamente l'editor responsabile; un riferimento a tipo/operazione apre la relativa definizione. I dialoghi raccolgono valori tipizzati, senza richiedere JSON.
3. **Tasks and Clarifications** crea un intento per operazione, interazione, macchina o topologia. **Add Clarification** conserva domanda e risposta in una nuova revisione; **Revise Intent** cambia il testo. `foundation.tasks` è opzionale in v4: ogni revisione conserva la precedente completa, con aggiornamento condizionato alla revisione attesa. Non cambia v2/v3. L'anteprima e la preparazione reale usano l'intento corrente del solo target interessato.
4. **Prepare Model to Code Review** o il reverse esplicito preparano un worktree con il motore esistente. La normale **Model and Code Review** resta nel diagramma, mostra piano, copertura, esiti e comandi. **Technical Preview and Differences** apre i diff e il pacchetto esatto come approfondimento. Conflitti/errori restano visibili e aprono specifica/vincoli o chiarimenti; nessuna risoluzione viene inferita.
5. **Run Real Verification** esegue il runner delimitato del profilo. **Publish Verified Model and Code** richiede verifiche passate e conferma esplicita; una revisione superata blocca anche la chiamata diretta. **Undo Publication** e recovery riusano lock, journal e pre/postimmagini. **Return to Diagram Selection** ripristina il focus della selezione senza cambiare vista.

Il runner prova predicati, piani delle interazioni, stati piatti e configurazione/simulazione dei messaggi con criteri indipendenti. Codice personalizzato e broker vivo richiedono i percorsi dichiarati separati. Le etichette distinguono simulazione, verifica reale e pubblicazione. La lettura accessibile include gerarchia, ordine, guardie, azioni, ADR/storia, ignoti e intento. Stato e conflitto hanno testo oltre al colore.

## Matrice del primo profilo

| Ambito | Vedere | Creare e modificare | Prove di produzione |
| --- | --- | --- | --- |
| L1 | C4 e proprietà di scope | Elementi/attori, scope, integrazioni e responsabilità | Blueprint, project service e renderer C4 |
| L2 | Ruoli e tecnologia risolta, broker/canali | Container, binding, connessioni e trasporti | Blueprint e messaging; cambio archetipo in DAI-11 |
| L3 | Ownership, porte e consumer | Componenti, interfacce, librerie e membership | Blueprint editing, proiezioni condivise e impatto |
| L4 | Contratti, tipi, errori e criteri | Tipi, firme, invarianti, espressioni | Blueprint/predicate editing e documenti nativi |
| Sequenze | Ordine, annidamenti, guardie e `ref` | Editor gerarchico, sei frame e politiche | Interaction editing/sequence, lettura accessibile |
| Stati | Owner, eventi e entry/exit/do | Stati, azioni, guardie e priorità | State editing/renderer, simulazione locale distinta |
| Messaggi | Producer, queue/topic, schema e policy | Topologie, contratti, retry e idempotenza | Messaging editing/renderer e criteri indipendenti |
| ADR | Stato, scope, vincoli e storia | Record, revisione e sostituzione | Blueprint editing, proprietà e lettura accessibile |
| Operazioni | Piano, conflitti e output reali | Task, chiarimenti, forward/reverse, review | Task editing, project service, motore/protocollo reale |

I dialoghi e le transazioni sono le implementazioni native; i collaudi li guidano con input scriptati. Chromium esegue i renderer reali e tastiera con CSS di produzione, non l'intero workbench Electron. La certificazione desktop e l'equivalenza su due stack restano nelle accettazioni successive.

## Opt-in e limiti

**Start or Stop Continuous Preparation** abilita esplicitamente la preparazione locale per il progetto corrente. L'utente sceglie da 1 a 100 preparazioni e conferma scope, salvataggio degli edit validi, budget e politica di review manuale. La configurazione di workspace conserva versione, revisione, root e tentativi consumati. Riavviare il workbench non avvia job: **Resume Saved Budget** riprende il consumo precedente; **Set New Budget** richiede una nuova scelta esplicita.

La coda coalesca gli edit semantici per 600 ms, riserva e salva un tentativo prima dell'adapter e serializza i job. Un documento incompleto annulla il job precedente; non è sufficiente che l'ultima versione parsata fosse valida. Il job salva e ricontrolla la revisione prima dell'invio al worker. Le nuove revisioni annullano il token e scartano comunque ogni completamento obsoleto. Stop, cambio progetto e dispose annullano il lavoro. Un fallimento non entra in retry: viene mostrato e richiede ripresa esplicita. Se un'altra operazione occupa il lock nativo, il tentativo resta consumato e il problema viene esposto.

Il limite conta i tentativi, inclusi preparazioni allineate, cancellazioni e fallimenti, per evitare consumi non contabilizzati. Ogni pacchetto ha al massimo 192 KiB di input e 64 KiB di riserva output; anche un limite inferiore passato al protocollo viene applicato prima di creare il worktree. Overflow blocca, senza troncatura. Preparare un target allineato produce zero proposte, riscritture e chiamate IA. Eventi ripetuti di selezione/layout/zoom/formattazione non cambiano la revisione semantica.

Questo profilo usa emissione deterministica: provider assente, zero inferenze e nessuna spesa stimata trasformata in prezzo reale. Usage e prezzo non misurati restano null. La continuità prepara la review; verifica e pubblicazione richiedono azioni esplicite. Nessun job migra broker, ledger, checkpoint o altri dati vivi. Non viene aggiunto un servizio di pubblicazione o un secondo journal.
