<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# Revisione della guida ADE · 17 novembre 2026

## Riferimento, pubblico e obiettivo

Revisione della guida completa presente su `main`, commit [`8a069e4b7207be8bcbfee2d572fdeb45e2fc3e6c`](https://github.com/FrappaF/ADE/commit/8a069e4b7207be8bcbfee2d572fdeb45e2fc3e6c). Il riferimento è il codice di questa revisione, non una futura versione di `main`. Sono stati letti integralmente il sorgente della guida e i materiali pertinenti di progetto; le fonti di comportamento sono state cercate nel codice e nei progetti didattici.

In assenza di un pubblico indicato nel prompt, si assume un lettore che progetta o sviluppa software, nuovo ad ADE, con basi di dati, funzioni e condizioni. JavaScript e terminale servono nei capitoli che li usano. La guida combina primo utilizzo, laboratorio e consultazione: deve portare a un modello salvato e riapribile e a prove locali circoscritte. L’obiettivo e la priorità del percorso visuale derivano da [ADR 0002](https://github.com/FrappaF/ADE/blob/8a069e4b7207be8bcbfee2d572fdeb45e2fc3e6c/ade/docs/decisions/0002-visual-workbench.md), non dal solo codice. Gli esiti dell’esempio di codice sono confrontati anche con i suoi [requisiti](https://github.com/FrappaF/ADE/blob/8a069e4b7207be8bcbfee2d572fdeb45e2fc3e6c/ade/examples/guida/07-mercato-laboratorio/codice/REQUISITI.md).

## File prodotti

- [Guida completa revisionata](Guida-ADE.pdf), [HTML autonomo](Guida-ADE.html) e [sorgente modificabile](README.md).
- [Kit utente aggiornato](ADE-kit-utente.zip), con guida, immagini, progetti, istruzioni iniziali e questo rapporto.
- [Istruzioni iniziali](INIZIA-QUI.txt) aggiornate con versione e percorsi facoltativi.
- PDF e testo originali conservati senza modifiche nella cartella `originale` del repository. Dal kit sono consultabili online al commit di riferimento: [PDF originale](https://github.com/FrappaF/ADE/blob/8a069e4b7207be8bcbfee2d572fdeb45e2fc3e6c/ade/docs/guida-utente/Guida-ADE.pdf) e [testo originale](https://github.com/FrappaF/ADE/blob/8a069e4b7207be8bcbfee2d572fdeb45e2fc3e6c/ade/docs/guida-utente/README.md). L’HTML precedente resta nella stessa storia Git; gli originali non appesantiscono il kit utente.
- Generatore `ade/scripts/build-user-guide.py`, per ricostruire HTML, PDF e kit dal sorgente senza modificare il software ADE. Consultare l’aiuto dello script per dipendenze e comando di esecuzione.

## Modifiche principali

L’apertura ora dichiara destinatari, risultato, versione e prerequisiti prima di T1. Una tabella permette di scegliere il percorso: orientamento, progettazione, verifica quantitativa, moduli autonomi, codice o attività assistite. La dipendenza reale fra tipi già creati è distinta dall’ordine consigliato per compilarne i campi. L’atlante aggiunge criteri per scegliere la notazione in base alla domanda dell’utente e spiega le sigle.

Sono state corrette le istruzioni che attribuivano al tour o alle condizioni descrittive prove assenti, completati passaggi dei form, precisati i comandi di riordino e corretto il significato del budget IA. I riferimenti online sono fissati alla revisione documentata e i prerequisiti Linux essenziali sono leggibili anche nel kit. Le prove storiche del desktop sono separate dai riscontri di questa revisione.

## Discrepanze sostanziali e fonti

Le pagine si riferiscono al **PDF originale di 85 pagine**, conservato nella cartella `originale`. Le sezioni mantengono gli stessi identificativi nella guida revisionata. Tutti i collegamenti alle evidenze puntano al commit di riferimento.

| Pagina / sezione originale | Problema | Correzione nella guida | Evidenza indipendente |
| --- | --- | --- | --- |
| 4, Come usare questa guida | Destinatari impliciti e invito a leggere le tre parti in ordine, anche quando bastano attività locali | Competenze iniziali e prerequisiti espliciti; percorsi per obiettivo e distinzione fra sequenza didattica, moduli autonomi e rami condizionati | [ADR 0002, primo percorso](https://github.com/FrappaF/ADE/blob/8a069e4b7207be8bcbfee2d572fdeb45e2fc3e6c/ade/docs/decisions/0002-visual-workbench.md#primo-percorso-da-realizzare); [runner Node richiesto](https://github.com/FrappaF/ADE/blob/8a069e4b7207be8bcbfee2d572fdeb45e2fc3e6c/ade/ai/trustedNode.ts#L20-L31) |
| 7, T2 | La sequenza del tour veniva usata per controllare autorizzazione prima della registrazione; il modello mostra soltanto due esiti alternativi | Descritti “conferma ordine” e “mostra errore” con le loro condizioni; rinvio a L7 per autorizzazione e scrittura | [Nodi e messaggi di Sequenza pagamento](https://github.com/FrappaF/ADE/blob/8a069e4b7207be8bcbfee2d572fdeb45e2fc3e6c/ade/examples/guida/01-bottega-visuale/.ade/model.json#L462-L487); [definizioni dei messaggi](https://github.com/FrappaF/ADE/blob/8a069e4b7207be8bcbfee2d572fdeb45e2fc3e6c/ade/examples/guida/01-bottega-visuale/.ade/model.json#L295-L309) |
| 6 e 13, T2 e L2 | La condizione sul Write sembrava impedire una registrazione non autorizzata | Presentata come regola descritta, da implementare e verificare separatamente | [Il form memorizza il testo della condizione](https://github.com/FrappaF/ADE/blob/8a069e4b7207be8bcbfee2d572fdeb45e2fc3e6c/src/vs/workbench/contrib/ade/browser/adeEditingDiagram.ts#L186-L190) |
| 9, T5 | “Se compare la condizione” rendeva facoltativo un passaggio sempre presente nel form | Campo Condition (Optional), valore e conferma con Invio espliciti; Escape annulla il collegamento | [Form Connect](https://github.com/FrappaF/ADE/blob/8a069e4b7207be8bcbfee2d572fdeb45e2fc3e6c/src/vs/workbench/contrib/ade/browser/adeEditingDiagram.ts#L186-L190) |
| 10, T5 | Etichetta incompleta e accesso non indicato per la rimozione dalla sola vista | Menu contestuale, Remove from This Diagram e alternativa precisa dalla palette | [Menu del nodo](https://github.com/FrappaF/ADE/blob/8a069e4b7207be8bcbfee2d572fdeb45e2fc3e6c/src/vs/workbench/contrib/ade/browser/adeCanvasSurface.ts#L428); [comando della palette](https://github.com/FrappaF/ADE/blob/8a069e4b7207be8bcbfee2d572fdeb45e2fc3e6c/src/vs/workbench/contrib/ade/browser/adeEditingCommands.ts#L38) |
| 18, L5; richiamo D11 | Modifica di un attributo senza il passaggio intermedio Edit Member | Esplicitati selezione del membro, Edit Member e completamento del form | [Editing del membro esistente](https://github.com/FrappaF/ADE/blob/8a069e4b7207be8bcbfee2d572fdeb45e2fc3e6c/src/vs/workbench/contrib/ade/browser/adeNotationEditing.ts#L24-L35) |
| 27–28, L11 | Tipo “completo” presentato come requisito tecnico prima di poterlo riferire | Creazione e applicazione del tipo obbligatorie; compilazione preventiva dei campi consigliata | [Selettore dei tipi esistenti](https://github.com/FrappaF/ADE/blob/8a069e4b7207be8bcbfee2d572fdeb45e2fc3e6c/src/vs/workbench/contrib/ade/browser/adeBlueprintEditing.ts#L77-L84); [tipo della collezione](https://github.com/FrappaF/ADE/blob/8a069e4b7207be8bcbfee2d572fdeb45e2fc3e6c/src/vs/workbench/contrib/ade/browser/adeBlueprintEditing.ts#L168) |
| 31, L12 | Obiettivo 1–10 anticipato senza distinguere subito la prima prova della sola positività | Apertura distinta in verifica del template e aggiunta del massimo 10 | [Requisiti della base](https://github.com/FrappaF/ADE/blob/8a069e4b7207be8bcbfee2d572fdeb45e2fc3e6c/ade/examples/guida/02-quantita-ordine/LEGGIMI.md); [soluzione con limite](https://github.com/FrappaF/ADE/blob/8a069e4b7207be8bcbfee2d572fdeb45e2fc3e6c/ade/examples/guida/02-quantita-ordine/soluzione-limite/LEGGIMI.md) |
| 41, L17 | Budget descritto come numero di richieste al provider | Specificate invocazioni CLI per operazione; distinti richieste HTTP, turni, tentativi e token interni | [Definizione del budget strutturato](https://github.com/FrappaF/ADE/blob/8a069e4b7207be8bcbfee2d572fdeb45e2fc3e6c/ade/docs/ai-collaboration.md#L55) |
| 59, D6 | Colonne apparentemente selezionabili, campi chiamati Source/Target Member e ordine dei form errato | Cinque campi reali nell’ordine corretto: molteplicità, nomi digitati delle colonne, protocollo | [Form Edit Cardinalities and Protocol](https://github.com/FrappaF/ADE/blob/8a069e4b7207be8bcbfee2d572fdeb45e2fc3e6c/src/vs/workbench/contrib/ade/browser/adeNotationEditing.ts#L48-L59) |
| 60, D7; 77, A5 | Riordino della sequenza poco concreto e frecce da tastiera generalizzate a tutte le viste | Comandi Move Participant Left/Right e Move Message Earlier/Later; spostamento libero limitato alle viste pertinenti | [Ordine partecipanti](https://github.com/FrappaF/ADE/blob/8a069e4b7207be8bcbfee2d572fdeb45e2fc3e6c/src/vs/workbench/contrib/ade/browser/adeInspector.ts#L105-L109); [ordine messaggi](https://github.com/FrappaF/ADE/blob/8a069e4b7207be8bcbfee2d572fdeb45e2fc3e6c/src/vs/workbench/contrib/ade/browser/adeInspector.ts#L149-L155); [renderer Sequence](https://github.com/FrappaF/ADE/blob/8a069e4b7207be8bcbfee2d572fdeb45e2fc3e6c/src/vs/workbench/contrib/ade/browser/adeCanvasSurface.ts#L141-L164) |
| 74, A1 | Clone senza selezione della versione: una futura main potrebbe non corrispondere alla guida | Checkout del commit documentato prima dell’installazione e spiegazione della modalità detached HEAD | [Revisione scelta](https://github.com/FrappaF/ADE/commit/8a069e4b7207be8bcbfee2d572fdeb45e2fc3e6c); [preparazione dai sorgenti](https://github.com/FrappaF/ADE/blob/8a069e4b7207be8bcbfee2d572fdeb45e2fc3e6c/ade/docs/fork-development.md#da-un-clone-pulito) |
| 74 e 82, A1 e A8 | Otto rimandi relativi a documenti assenti dal kit; prerequisiti Linux disponibili solo seguendo uno di essi | URL GitHub fissati al commit e prerequisiti Linux essenziali nel testo; connessione necessaria dichiarata | [Elenco dei prerequisiti](https://github.com/FrappaF/ADE/blob/8a069e4b7207be8bcbfee2d572fdeb45e2fc3e6c/ade/docs/fork-development.md#L11-L15); contenuto dell’archivio originale verificato localmente |
| 81, A7 | “16 viste” al posto di 18 viste in 16 notazioni; prova desktop attribuita genericamente al percorso corrente | Numeri distinti e cronologia delle verifiche esplicita | [Soluzione didattica](https://github.com/FrappaF/ADE/tree/8a069e4b7207be8bcbfee2d572fdeb45e2fc3e6c/ade/examples/guida/07-mercato-laboratorio/soluzione); [verbale precedente](https://github.com/FrappaF/ADE/blob/8a069e4b7207be8bcbfee2d572fdeb45e2fc3e6c/ade/docs/guida-utente/VERIFICA-LABORATORIO.md) |

## Verifiche di contenuto eseguite

- Lettura completa prima dell’editing e rilettura delle modifiche assumendo le sole competenze dichiarate. Riscontri su codice dei form, comandi e renderer, decisioni di progetto ed esempi; non solo sulla guida stessa.
- Conteggi della soluzione confrontati con il modello: 18 viste in 16 notazioni; ERD con 10 attributi; schema con 15 colonne; Sequence con quattro partecipanti e tre messaggi; Activity con sette nodi e otto collegamenti; sette tipi condivisi, operazione, contratto, provider, mapping e ADR.
- Casi distribuiti confrontati con i JSON: quantità iniziale 8, soluzione limite 12, interazioni 7, macchina a stati 4 e topologia messaggi 9. Questi conteggi descrivono dati presenti, non attestano una nuova esecuzione dei runner ADE.
- Con Node **24.22.1**, eseguiti `npm test` e `npm start` sia in `07-mercato-laboratorio/codice` sia in `03-codebase-ordini`: **7/7 test passati** per cartella; demo **`{ status: 'confirmed', totalCents: 2500 }`** in entrambe.
- Controllata la sequenza descrittiva del tour contro i nodi e i messaggi effettivamente inclusi. Gli esiti alternativi non sono stati interpretati come traccia runtime.

## Verifiche degli export

I risultati dell’export e dell’ispezione visuale sono registrati nella sezione dedicata del [verbale](VERIFICA-LABORATORIO.md). Il controllo deve comprendere corrispondenza con il sorgente, immagini, indice, segnalibri, collegamenti, testo selezionabile, lettura strutturale HTML, limiti di pagina e controllo visuale del PDF. La sola estrazione del testo non attesta la qualità dell’impaginazione.

### Rigenerazione dal repository

Il sorgente da modificare è `ade/docs/guida-utente/README.md`; il template dell’HTML e le dipendenze del generatore sono accanto allo script. Dalla radice del repository, con Python 3 e i font Liberation Sans/Mono installati:

```sh
python3 -m venv /tmp/ade-guide-venv
/tmp/ade-guide-venv/bin/python -m pip install -r ade/scripts/user-guide-requirements.txt
/tmp/ade-guide-venv/bin/python ade/scripts/build-user-guide.py --revision 8a069e4b
```

Su un sistema con i font in un’altra cartella, aggiungi `--font-dir` seguito dal percorso che contiene i file Liberation. Il parametro `--revision` indica la versione **del software documentato**: aggiornalo solo dopo una nuova verifica della guida contro quella versione. Il generatore sostituisce gli export correnti e ricrea il kit, senza modificare gli originali o i progetti. Se cambi solo rapporto, verbale o istruzioni iniziali, lo stesso comando con `--kit-only` aggiorna il pacchetto senza rigenerare PDF e HTML. Per evitare di distribuire un export superato, completa la rigenerazione dopo ogni modifica al sorgente e ripeti i controlli pertinenti.

## Punti ancora da verificare

| Punto | Informazioni o ambiente necessari |
| --- | --- |
| Percorso completo nella versione desktop di riferimento | Eseguire T1–L21 pertinenti su una build del commit indicato, registrando sistema operativo, comandi e risultati; i collaudi macOS storici non sostituiscono questa prova |
| Qualità e limiti delle attività con provider | Account, CLI e modello disponibili; prove reali con contesto e budget dichiarati. Nessuna nuova chiamata IA eseguita in questa revisione |
| Laboratorio Sync/worktree riproducibile da zero | Progetto compatibile con baseline e criteri riconosciuti; i moduli distribuiti non completano automaticamente i prerequisiti legacy |
| Scelta del lifecycle reale | Decisione di dominio su Paid/Cancelled rispetto a Confermato/Rifiutato; i nomi del modulo eseguibile non definiscono da soli un mapping |
| Runtime Bun e infrastrutture esterne | Bun 1.3.2 e test pertinenti; broker, pagamenti, database o deploy effettivi richiedono ambienti e prove d’integrazione separati |
| Accessibilità con tecnologie assistive | Prove con screen reader su piattaforme dichiarate e verifica specialistica del PDF; struttura, testo selezionabile e controlli automatici non equivalgono a conformità PDF/UA |

Non sono state eseguite nuove prove dell’intera applicazione ADE, del reverse, delle simulazioni o dei provider remoti. Le schermate preesistenti sono state conservate come immagini di orientamento e confrontate con i contesti documentati; non sono nuove acquisizioni da un desktop della revisione corrente. Nessuna modifica al software o agli esempi è necessaria per le correzioni documentali qui descritte.
