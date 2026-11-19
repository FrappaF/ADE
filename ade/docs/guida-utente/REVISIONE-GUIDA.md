<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# Revisione della guida ADE · 17 novembre 2026

Questo rapporto comprende l’allineamento al progetto e la successiva [revisione degli scopi e delle motivazioni](#revisione-degli-scopi-e-delle-motivazioni), richiesta durante la lettura del PDF.

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

Su un sistema con i font in un’altra cartella, aggiungi `--font-dir` seguito dal percorso che contiene i file Liberation. Il parametro `--revision` descrive la versione del software documentato. Il generatore sostituisce gli export correnti e ricrea il kit. Dopo una modifica agli esempi usa anche `--rebuild-examples` per ricostruire l’archivio dalla cartella `ade/examples/guida`, compresi i modelli e i casi dentro `.ade`. Se cambi soltanto il rapporto, il verbale o le istruzioni iniziali, usa `--kit-only` per aggiornare il pacchetto. Dopo ogni modifica al testo della guida rigenera gli export e ripeti i controlli pertinenti.

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


## Revisione degli scopi e delle motivazioni

La richiesta successiva del lettore riguarda il motivo delle azioni, con un esempio preciso: L3 indicava come creare i casi d’uso, ma non spiegava prima della procedura perché servissero. Questa revisione parte dai documenti del commit [ce5e7b4b](https://github.com/FrappaF/ADE/commit/ce5e7b4b); la versione del software di riferimento resta `8a069e4b`, perché l’intervento riguarda soltanto la documentazione.

Per ogni capitolo, sottocapitolo e istruzione è stata posta la domanda «quale risultato voglio ottenere, perché mi serve e perché lo faccio in questo momento?». Il controllo comprende paragrafi operativi, ogni voce degli elenchi e le righe delle tabelle usate come istruzioni. Quando le azioni hanno uno scopo comune, la spiegazione è posta prima della sequenza; i motivi delle scelte meno ovvie sono aggiunti accanto alla scelta. Non si ripete un’etichetta “Perché” per ogni clic e non si presenta l’ordine didattico come obbligo tecnico.

La copertura è di **52 capitoli, 111 sottocapitoli e 397 blocchi operativi**: liste e tabelle sono contate come un blocco ciascuna e controllate anche al loro interno; ogni paragrafo operativo costituisce un altro blocco. Il conteggio non indica un numero di test software. Sono state inoltre riviste l’introduzione generale, Come usare questa guida e le quattro aperture di parte, per collegare i risultati delle fasi. Nell’audit 115 titoli richiedevano integrazioni nel corpo della relativa sezione; per 48 la motivazione era già esplicita ed è stata conservata.

### Esempi delle spiegazioni aggiunte

| Punto | Domanda del lettore | Risposta ora vicina all’azione |
| --- | --- | --- |
| L3, Use Case | Perché creare un’altra vista dopo il Context? | Il Context delimita il prodotto e gli interlocutori; i casi d’uso fissano i risultati richiesti da Cliente e Assistenza. Servono come riferimento per assegnare responsabilità e descrivere i flussi, prima di discutere l’interno di Mercato |
| L3, attori, ownership e Include/Extend | Perché riusare Cliente e Mercato, assegnare un owner e scegliere questi collegamenti? | Le identità restano condivise; l’owner dichiara a quale sistema appartiene l’obiettivo; pagamento necessario e coupon opzionale non devono diventare requisiti equivalenti. Il coupon resta un esempio descrittivo di estensione |
| L4–L6, tipi e viste | Perché non usare sempre lo stesso oggetto Ordine o lo stesso tipo di collegamento? | Responsabilità, entità, tabella e classe esprimono decisioni diverse. Ownership, protocolli, chiavi e contratti rendono leggibili appartenenza, integrazione e conservazione dei dati |
| L11, tipi, firma e provider | Perché definire prima i dati, poi l’operazione e il fornitore? | I campi devono poter riferire tipi esistenti; la firma stabilisce dati accettati ed esiti; l’interfaccia include l’operazione e il binding identifica il componente che offre l’accordo |
| L12, confronto e All True | Perché non basta quantity ≤ 10? | Il solo massimo ammetterebbe zero e negativi: la congiunzione conserva sia il limite inferiore sia quello superiore. I casi 0, 1, 10 e 11 distinguono i confini inclusi da un confronto errato |
| L14–L16, scenari e dati di esempio | Perché provare successo, errore e duplicati prima di cambiare il modulo? | Una traccia positiva offre il riferimento; gli altri casi mostrano rifiuto, recupero e consegna ripetuta. Identità, correlazione e tempi logici rendono riconoscibile la simulazione. Test e demo hanno risultati diversi |
| L18–L20, worktree, baseline e reverse | Perché isolare i file, confrontare tre versioni e provocare una verifica fallita? | La base pulita rende attribuibile il diff, la baseline distingue i due lati modificati, il reverse con limite 9 dimostra il blocco rispetto all’atteso indipendente per 10 |
| D0–D16 e A1–A9 | Perché scegliere questa notazione o questo strumento? | I criteri di scelta restano accanto alle procedure: domanda da rappresentare, identità da riusare, verso delle dipendenze, runtime necessario, strumento di verifica, filtro da aggiungere o rimuovere |

Le spiegazioni restano entro gli scopi delle [decisioni sul workbench](https://github.com/FrappaF/ADE/blob/8a069e4b7207be8bcbfee2d572fdeb45e2fc3e6c/ade/docs/decisions/0002-visual-workbench.md) e del [catalogo dei diagrammi](https://github.com/FrappaF/ADE/blob/8a069e4b7207be8bcbfee2d572fdeb45e2fc3e6c/ade/docs/diagram-catalog.md). Scelte didattiche come email Unique, firme minime e protocolli progettati non diventano requisiti universali. La lettura incrociata ha anche precisato che un argomento può provenire dagli input o da un risultato precedente; se usa un risultato, deve riferirsi all’occorrenza pertinente.

### Traccia della verifica per capitolo e sottocapitolo

La riga del capitolo riguarda il suo testo diretto; ogni sottocapitolo ha una riga propria. “Già esplicito” indica che la risposta era presente nel corpo della sezione o nella spiegazione immediatamente condivisa. Sono state cercate anche le ragioni delle singole scelte nelle sequenze: un paragrafo introduttivo generico non è stato considerato sufficiente per giustificare un dettaglio non ovvio.

| Capitolo o sottocapitolo | Esito | Dove si trova la risposta e che cosa spiega |
| --- | --- | --- |
| T1. Apri il negozio e trova i comandi essenziali | Integrato | Apertura del capitolo e paragrafo prima dei quattro comandi; Orientarsi su un modello pronto prima di confrontare le viste; scelta dei quattro comandi e recupero degli oggetti. |
| T2. Segui un acquisto attraverso quattro prospettive | Integrato | Apertura del capitolo, letture delle quattro viste e controllo finale; Separare responsabilità, percorsi, messaggi e stato prima della costruzione manuale; i limiti della sequenza minima restano espliciti. |
| T3. Esplora la seconda feature: resi e rimborsi | Integrato | Apertura del capitolo e introduzione alla tabella delle altre viste; Leggere il reso dopo l’acquisto perché dipende da Ordine esistente; distinguere ammissione e completamento. |
| T4. Ritrova un elemento e riconosci l’identità condivisa | Integrato | Apertura del capitolo, scelta ricerca/mappa e prova di rinomina; Provare identità e impatto prima di modificare; scegliere ricerca per nome o mappa per contesto. |
| T5. Fai una prima modifica reversibile | Integrato | Apertura del capitolo a copertura della sequenza notifica-salvataggio-annullamento; Responsabilità della notifica e condizione progettata; conservare, annullare e ritrovare un cambiamento limitato. |
| L1. Prepara il laboratorio e scegli la cartella giusta | Integrato | Apertura del capitolo, spiegazione prima della lista e confronto/salvataggio finale; Separare costruzione, confronto e prove locali; conservare tappe senza sostituire il proprio modello. |
| L2. Crea il progetto, le feature e la prima struttura | Integrato | Apertura del capitolo con risultato e collegamento alle viste successive; Passare dal tour alle identità che saranno riusate nelle viste dedicate. |
| L2 · Creazione e navigazione iniziale | Integrato | Paragrafo prima della lista numerata; Creare root e raggruppamenti per capacità prima delle viste; chiarire che le feature non sono ruoli o servizi. |
| L2 · Aggiungi i primi sei elementi | Integrato | Paragrafo prima di istruzioni e tabella con tipi/responsabilità; Associare tipi e responsabilità alla compatibilità e al riuso nelle viste successive. |
| L2 · Crea una relazione dall’inizio alla fine | Integrato | Paragrafo prima della lista, spiegazione dei tipi dopo la tabella e distinzione riuso; Trasformare un elenco di responsabilità in ingresso, coordinamento, autorizzazione e registrazione; tipi e riuso già motivati. |
| L2 · Rinomina, disponi e salva | Integrato | Paragrafo iniziale a copertura di rinomina, layout, salvataggio e riapertura; Ritrovare la vista fra le successive e accertare la conservazione della tappa nella root corretta. |
| L3. Definisci il contesto e gli obiettivi degli utenti | Integrato | Apertura del capitolo collegata a L2 e L4; Fissare responsabilità governate e obiettivi prima della suddivisione interna. |
| L3 · Usa il wizard Structural Blueprint | Integrato | Paragrafo prima della sequenza Choose/Configure/Review e note sui target; Esprimere dichiarazioni condivise che la posizione sul canvas non conserva; review prima della modifica. |
| L3 · Crea e qualifica il sistema | Integrato | Paragrafo prima di creazione e scope; Distinguere confine del prodotto dal nome progetto; applicare lo scope necessario al soggetto C4 e riusare le identità. |
| L3 · Crea il C4 Context | Integrato | Paragrafo prima dei nove passi e scopo prima delle quattro Communication; Mostrare attori e dipendenze oltre il confine prima dei dettagli; separare soggetto, contesto e selezione visibile. |
| L3 · Crea Use Case e aggiungi gli elementi esistenti | Integrato | Apertura prima della creazione vista, scopo prima della tabella, motivazione prima di ownership ed esempio include/extend dopo; Chiarire obiettivi di Cliente e Assistenza, necessario/opzionale e loro uso nelle scelte successive; ordine didattico non tecnico. |
| L4. Costruisci C4 Container e C4 Component | Integrato | Apertura del capitolo collegata a confine e obiettivi; Passare da confine e obiettivi a parti comunicanti e responsabilità interne coerenti. |
| L4 · Crea i container e scegli i ruoli mostrati dal form | Integrato | Paragrafo prima della creazione, tabella dei ruoli e spiegazione accanto all’ownership; Separare presentazione, servizio, persistenza ed eventi; ruolo e appartenenza preparano la vista senza avviare servizi. |
| L4 · Crea e apri la vista Container | Integrato | Paragrafo iniziale e motivazione prima/dopo il form protocolli; Mostrare comunicazioni interne al livello pertinente; esplicitare scelte di protocollo e campi volutamente vuoti. |
| L4 · Costruisci prima i componenti, poi il contratto | Integrato | Apertura prima dell’ownership e motivo accanto alla creazione Contract; Definire responsabilità e owner prima della vista; distinguere contratto offerto e componente che lo realizza. |
| L5. Crea entità, colonne e riferimenti con i form | Integrato | Apertura del capitolo con ordine dominio/persistenza; Chiarire significato dei dati prima della conservazione; mantenere dominio e persistenza distinti. |
| L5 · Crea l’ERD nel gruppo Data | Integrato | Paragrafo prima della creazione e distinzione identità dopo; Rappresentare i dati necessari alle responsabilità già progettate senza anticipare le tabelle. |
| L5 · Compila un attributo dall’inizio alla fine | Integrato | Paragrafo prima dei passi customerId, motivazione prima della tabella e distinzione presenza/null dopo; Precisare informazione, identificativi, tipi e centesimi; No Key separa dominio e schema; presenza/null già spiegate. |
| L5 · Disegna e completa le cardinalità | Integrato | Paragrafo prima di form e tabella, interpretazione bidirezionale dopo; Dichiarare quantità ammesse prima dei riferimenti fisici; chiarire campi non pertinenti e lettura bidirezionale. |
| L5 · Crea lo schema fisico | Integrato | Apertura prima delle Table, motivazione delle chiavi e destinazioni prima delle Association, scopo prima delle tre relazioni finali; Distinguere Table ed Entity, motivare PK/Unique/FK e completare le destinazioni dei riferimenti senza promettere un database. |
| L6. Costruisci Class, UML Component e Package | Integrato | Apertura del capitolo collegata a dati e sorgenti da realizzare; Passare dai dati all’organizzazione del codice da realizzare distinguendo tre domande. |
| L6 · Class appartiene al gruppo Data | Integrato | Paragrafo prima della creazione tipi, spiegazione accanto a submit/save e limiti prima delle Dependency; Separare tipo con metodi da risorsa ed entità; motivare le operazioni minime e il rimando ai contratti completi. |
| L6 · UML Component riusa i contratti esistenti | Integrato | Paragrafo prima di riuso, nuova Implementation e controllo delle tre frecce; Conservare la stessa identità dei contratti fra viste e assegnare chi li fornisce. |
| L6 · Package mostra i layer logici | Integrato | Paragrafo prima di Package/Dependency e spiegazione del limite dopo; Dichiarare dipendenze fra regole, coordinamento e dettagli esterni prima dei sorgenti senza inventare enforcement. |
| L7. Costruisci flusso, sequenza e stati dell’acquisto | Integrato | Apertura con ordine consigliato e domande distinte; Dal percorso ai partecipanti e allo stato; distinguere ordine consigliato e vincolo tecnico. |
| L7 · Activity: azioni e alternative | Integrato | Paragrafo prima di riuso Flow e tabella nodi, motivo prima dei Control Flow; Riusare il Flow, distinguere cause di rifiuto e usare Control Flow per l’avanzamento fra passi. |
| L7 · Sequence: partecipanti e messaggi sono due selezioni diverse | Integrato | Paragrafo prima dei partecipanti e spiegazione dopo l’elenco dei tre messaggi; Assegnare le chiamate alle identità di responsabilità, non a omonimi dati; dichiarare ordine senza duplicare relazioni. |
| L7 · State: scegli prima la risorsa del lifecycle | Integrato | Paragrafo prima del Resource Lifecycle e spiegazione adiacente ad Add State; Esplicitare la condizione conservata dallo stesso Ordine dopo le azioni e mantenere un unico lifecycle. |
| L8. Costruisci le viste Resi e verifica il riuso | Integrato | Risposta nel paragrafo di apertura. Riuso Cliente/Ordine e separazione della richiesta; flusso e impatto motivati prima delle azioni. |
| L8 · Riusa la struttura automatica della feature | Integrato | Risposta nel paragrafo di apertura e vicino alle scelte operative. Identità condivise distinte da risorse nuove; chiamata/lettura/scrittura hanno ruoli espliciti. |
| L8 · Completa il flusso del rimborso | Integrato | Risposta nel paragrafo di apertura. Dopo le responsabilità, condizioni didattiche separano ammissione e rifiuto. |
| L8 · Controlla impatto e identità | Integrato | Risposta nel paragrafo di apertura. Due feature rendono pertinente la prova reversibile dell’identità condivisa. |
| L9. Progetta collocazione e connessioni | Integrato | Risposta nel paragrafo di apertura. Collocazione e comunicazioni riusano l’architettura già definita; nessun obbligo tecnico inventato. |
| L9 · Deployment: dove sono collocate le parti | Integrato | Risposta nel paragrafo di apertura e vicino alle scelte operative. Host, artifact, ownership e ambiente hanno significati distinti; controllata leggibilità gruppi. |
| L9 · Network: quali collegamenti sono dichiarati | Integrato | Risposta nel paragrafo di apertura e vicino alle scelte operative. Protocolli e relazione SQL condivisa spiegano confini e comunicazioni previste. |
| L10. Segui i dati e controlla tutte le notazioni | Integrato | Risposta nel paragrafo di apertura e vicino alle scelte operative. Percorso dei dati e verifica cumulativa precedono la formalizzazione del contratto. |
| L11. Formalizza tipi, contratto e decisione | Integrato | Risposta nel paragrafo di apertura. Firma, provider, mapping e ADR trasformano responsabilità generali in accordi espliciti. |
| L11 · Crea prima i tipi, nell’ordine delle dipendenze | Integrato | Risposta nel paragrafo di apertura e vicino alle scelte operative. Dipendenze fra tipi e differenza required/null motivate prima della firma. |
| L11 · Crea l’operazione sul contratto corretto | Integrato | Risposta nel paragrafo di apertura e vicino alle scelte operative. Owner Contract, firma e regole descrittive hanno scopo e risultato dichiarati. |
| L11 · Esponi il contratto e dichiara chi lo fornisce | Integrato | Risposta nel paragrafo di apertura e vicino alle scelte operative. Prima esporre l’operazione poi collegare il fornitore; invarianti non inventati. |
| L11 · Mappa il campo e collega il Catalogo | Integrato | Risposta nel paragrafo di apertura e vicino alle scelte operative. Mapping fra identità distinte; membership Catalogo non modifica ownership. |
| L11 · Registra una decisione verificabile | Integrato | Risposta nel paragrafo di apertura e vicino alle scelte operative. Centesimi e scope spiegano la scelta prima dell’implementazione; Proposed conservato. |
| L12. Implementa e verifica il limite della quantità | Già esplicito | Risposta nel paragrafo di apertura. Introduzione corrente già distingue regola iniziale e finale; audit conservata. |
| L12 · Creare il template dal principio | Integrato | Risposta nel paragrafo di apertura. Modulo autonomo permette verifica delimitata; alternativa pronto/nuovo motivata. |
| L12 · Modificare il predicato dal form | Integrato | Risposta nel paragrafo di apertura e vicino alle scelte operative. Precondition sugli input e prova temporanea letterale preparano il cambiamento reale. |
| L12 · Scrivere due casi indipendenti | Integrato | Risposta nel paragrafo di apertura e vicino alle scelte operative. Attesi indipendenti precedono verifica e distinguono divieto di business da errore di tipo. |
| L12 · Preparare, verificare, applicare e annullare | Integrato | Risposta nel paragrafo di apertura. Sequenza review/verifica/Apply/Undo spiega tutela del risultato e reversibilità. |
| L12 · Esercizio completo: da quantità positiva a massimo dieci | Integrato | Risposta nel paragrafo di apertura e vicino alle scelte operative. Confronto <= e All True motivati inline; criterio aggiornato mantenendo identità e attesi. |
| L13. Rendi esplicite le chiamate del checkout | Integrato | Risposta nel paragrafo di apertura e vicino alle scelte operative. Dopo il predicato si verifica collaborazione; lettura opt e casi non equivalgono a pagamenti reali. |
| L14. Simula il ciclo di vita dell’ordine | Integrato | Risposta nel paragrafo di apertura. Dopo le chiamate si controlla evoluzione del lifecycle sotto eventi ed errori. |
| L14 · Macchine a stati | Integrato | Risposta nel paragrafo di apertura e vicino alle scelte operative. Modulo eseguibile distinto dalla vista descrittiva; ordine successo/fallimento/duplicati motivato. |
| L15. Simula pubblicazione e consegna dei messaggi | Integrato | Risposta nel paragrafo di apertura e vicino alle scelte operative. Queue/topic e policy collegano evento e destinatari; ogni decisione del caso base ha una ragione. |
| L16. Esegui il modulo di codice e importalo | Integrato | Risposta nel paragrafo di apertura e vicino alle scelte operative. Esecuzione iniziale crea riferimento comportamentale prima di inventario e possibili modifiche. |
| L16 · Importazione locale | Integrato | Risposta nel paragrafo di apertura. Dall’inventario alla dichiarazione concreta; scelta semantica/struttura esplicitata. |
| L16 · Copertura, scope e versioni | Integrato | Risposta nel paragrafo di apertura e vicino alle scelte operative. Limiti analisi e perimetro vengono controllati prima di interpretarli o inviarli al provider. |
| L17. Usa l’IA per esplorare, con contesto e review | Integrato | Risposta nel paragrafo di apertura e vicino alle scelte operative. Lettura architetturale separata da evidenza; account e contesto prima dell’invio. |
| L17 · Dal codice alle viste proposte | Integrato | Risposta nel paragrafo di apertura e vicino alle scelte operative. Piano e review giudicati contro responsabilità e fonti prima dell’applicazione. |
| L18. Richiedi un aggiornamento del codice e lavora in isolamento | Integrato | Risposta nel paragrafo di apertura e vicino alle scelte operative. Modello salvato comunica intento; diff e test ne verificano implementazione. |
| L18 · Una feature in un worktree | Integrato | Risposta nel paragrafo di apertura e vicino alle scelte operative. Isolamento Git, base e stato pulito giustificano prerequisiti e ordine. |
| L19. Riconcilia modello e sorgenti con Sync | Integrato | Risposta nel paragrafo di apertura e vicino alle scelte operative. Baseline e confronto a tre versioni recuperano intenzione senza rinomine arbitrarie. |
| L20. Completa il ciclo: reverse, runtime e continuità | Integrato | Risposta nel paragrafo di apertura. Continuità riguarda variazioni dopo implementazione, mantenendo criterio di business. |
| L20 · Tornare dal codice al modello | Integrato | Risposta nel paragrafo di apertura. Divergenza 10→9 intenzionale rende riconoscibile il blocco; ripristino già motivato. |
| L20 · Scegliere Node o Bun | Integrato | Risposta nel paragrafo di apertura. Cambiare runtime è scelta condizionata da comportamento da conservare e tool presente. |
| L20 · Task, chiarimenti e continuità | Integrato | Risposta nel paragrafo di apertura e vicino alle scelte operative. Ripresa fra sessioni e distinzione preparazione/applicazione; scelta manuale/continua motivata. |
| L21. Consegna il progetto a un’altra persona | Integrato | Risposta nel paragrafo di apertura e vicino alle scelte operative. Consegna e navigazione indipendente rendono progetto e limiti delle prove comprensibili. |
| D0. Scegli la prospettiva e leggi i simboli | Già esplicito | La matrice collega ogni domanda alla vista utile e distingue il livello di dettaglio; la scelta deriva dallo scopo, non dall’obbligo di produrre sedici diagrammi. |
| D0 · La procedura comune, senza modello testuale | Integrato | Esplicitati destinazione e raggruppamento della vista, soggetto C4 riconoscibile, risorsa del lifecycle, identità condivisa e controllo di persistenza/lettura completa; gli altri passi spiegano già riuso, compatibilità e correzione del perimetro. |
| D0 · Gli elementi: vocabolario condiviso | Già esplicito | Tabella e introduzione spiegano il ruolo per scegliere ogni tipo, distinguendo identità semantica da forma e livello; non richiede ulteriori motivazioni per i singoli clic. |
| D0 · Come leggere un collegamento | Già esplicito | Direzioni e semantica dei collegamenti sono già esplicite; condizioni, guardie, protocolli e cardinalità rispondono a domande diverse e ne delimitano il significato. |
| D1. Structure: la mappa delle responsabilità | Già esplicito | Le domande iniziali trovano risposta nella mappa Cliente–Web shop–Checkout–Ordine e nei tipi di collegamento dei sottocapitoli. |
| D1 · Quando e perché usarla | Già esplicito | Già spiega orientamento iniziale e panoramica trasversale; invita a limitare il dettaglio per mantenere leggibilità. |
| D1 · Elementi e dettagli | Integrato | La tabella chiarisce le responsabilità; integrato perché dichiarare descrizione/contenimento e quando aggiungere i contratti. |
| D1 · Collegamenti, costruzione e controllo | Integrato | Integrato il motivo dell’ordine consigliato (ingresso, coordinamento, risultato prima del contesto) e del riuso; i tipi di freccia e le viste successive hanno già criteri di scelta. |
| D2. C4 System Context: il confine del prodotto | Già esplicito | Le domande su prodotto, attori e sistemi esterni trovano risposta nella definizione del perimetro nei tre sottocapitoli. |
| D2 · Quando e perché usarlo | Già esplicito | Già collega il Context alla condivisione del perimetro con stakeholder e nuovi membri prima dei dettagli interni. |
| D2 · Elementi | Già esplicito | Il soggetto, gli attori e i sistemi esterni sono distinti per ruolo; già spiega perché escludere dettagli interni e che il contesto non cambia il controllo del sistema. |
| D2 · Collegamenti e uso in ADE | Integrato | Integrato il motivo dei campi soggetto/contesto/visibili e della creazione preventiva delle identità; direzione e nomi delle comunicazioni sono già giustificati. |
| D3. C4 Container: applicazioni e archivi | Già esplicito | Le domande sono risolte da responsabilità distribuibili, ownership, ruoli e integrazioni, distinti dalla distribuzione fisica. |
| D3 · Quando e perché usarlo | Già esplicito | Già esplicita la decisione sulle parti distribuibili e distingue container C4 da Docker e host. |
| D3 · Elementi | Integrato | Integrato perché l’ownership serve anche fuori dal layout; tabella e testo distinguono già applicazione, archivio e contesto senza duplicati. |
| D3 · Collegamenti, procedura e controllo | Integrato | Integrato perché completare ruoli, collegare applicazioni e collocare il contesto fuori dal confine; protocolli e intenti sono già distinti. |
| D4. C4 Component: l’interno di un’applicazione | Già esplicito | Le domande sono risolte distinguendo API soggetto, responsabilità interne, dipendenze esterne e contratto fornito. |
| D4 · Quando e perché usarlo | Già esplicito | Già lega la vista al bisogno di dettagliare un’applicazione quando il livello Container non basta. |
| D4 · Elementi e ownership | Integrato | Integrato perché dichiarare il provider del contratto; tabella e confronto Scorte/Archivio chiariscono già quali identità introdurre o riusare. |
| D4 · Collegamenti e uso | Integrato | Integrato perché applicare ownership e verificare il confine nel testo; sono già motivati i ruoli di Dependency, Communication e Implementation. |
| D5. ERD: concetti, attributi e cardinalità | Già esplicito | Le domande trovano risposta nella separazione del dominio dalle tabelle, negli attributi e nelle quantità ammesse. |
| D5 · Quando e perché usarlo | Già esplicito | Già spiega che il diagramma serve a concordare il significato dei dati prima della rappresentazione fisica. |
| D5 · Elementi e membri | Già esplicito | La tabella spiega identità, attributi, tipi, presenza e nullabilità; l’esempio Riga ordine motiva la scelta di un’entità separata. |
| D5 · Legami e cardinalità | Integrato | Integrato il motivo di definire oggetti/dati e leggere ogni relazione in entrambe le direzioni; numeri e associazioni hanno già esempi espliciti. |
| D6. Database Schema: tabelle e vincoli progettati | Già esplicito | Le domande sono risolte da colonne, chiavi, riferimenti e mapping distinti dalle identità logiche. |
| D6 · Quando e perché usarlo | Già esplicito | Già colloca lo schema dopo il chiarimento del dominio o nella lettura di migrazioni esistenti, distinguendo progettazione e fatti osservati. |
| D6 · Elementi e colonne | Già esplicito | Ruoli delle chiavi e significato di tipi/presenza/nullabilità sono espliciti; i mapping spiegano già come preservare la corrispondenza cambiando rappresentazione. |
| D6 · Riferimenti e procedura | Integrato | Integrati la dipendenza reale delle FK da colonne esistenti e il motivo di verificare rinomine/mapping; i cinque campi operativi sono già accompagnati dall’esempio completo. |
| D7. Sequence: partecipanti e ordine delle interazioni | Già esplicito | Le domande sono risolte da mittenti/destinatari e dall’ordine autorizzazione prima della registrazione, con distinzione descrittivo/eseguibile. |
| D7 · Quando e perché usarla | Già esplicito | Già spiega quando il punto di una lettura/scrittura cambia il risultato e perché la sequenza risolve quel problema. |
| D7 · Elementi e messaggi | Integrato | Integrati motivo del riuso e differenza fra disposizione delle colonne e ordine delle interazioni; il controllo testuale verifica la precedenza del pagamento. |
| D7 · Descrittiva ed eseguibile | Integrato | Integrato perché rappresentare il caso negativo separatamente: evita di far sembrare conferma e rifiuto sempre consecutivi; i contratti del profilo sono già distinti dal disegno. |
| D8. Activity / Flowchart: passi e alternative | Già esplicito | Le domande sono risolte dai percorsi fino agli esiti e dalle condizioni dei rami, senza richiedere classi o servizi. |
| D8 · Quando e perché usarla | Già esplicito | Già rende esplicito l’uso per discutere una procedura e individuare esiti mancanti prima delle scelte implementative. |
| D8 · Elementi | Già esplicito | La tabella motiva tipi e nomi; il testo spiega perché condizioni sovrapposte richiedono una decisione e perché nomi generici non chiariscono le alternative. |
| D8 · Costruzione e controllo | Integrato | Integrato il motivo dell’ordine consigliato e della chiusura di entrambi gli esiti, distinguendolo da un vincolo dell’editor; lettura e limiti eseguibili sono già motivati. |
| D9. State Machine: il ciclo di vita di una risorsa | Già esplicito | Le domande sono risolte da stati della stessa risorsa, eventi/transizioni e verifica dei casi accettati o rifiutati. |
| D9 · Quando e perché usarla | Già esplicito | Già collega la vista alle azioni ammesse solo in alcune fasi e al riconoscimento di transizioni illegali. |
| D9 · Elementi e dettagli | Già esplicito | La tabella distingue stato, evento, guardia ed effetto; il testo spiega già come differiscono transizioni interne ed esterne nel profilo eseguibile. |
| D9 · Uso e verifica | Integrato | Integrati il motivo della scelta della risorsa, dei nomi di eventi/esiti e del passaggio al contratto eseguibile per confrontare gli eventi con gli attesi. |
| D10. Deployment: dove collochiamo software e dati | Già esplicito | Le domande sono risolte separando applicazione, artifact, ambiente ospitante e responsabilità architetturale. |
| D10 · Quando e perché usarlo | Già esplicito | Già lega la vista a separazione web/API, persistenza e confini d’ambiente e la distingue dalla responsabilità mostrata in C4. |
| D10 · Elementi e proprietà | Già esplicito | La tabella spiega il ruolo di ogni oggetto e perché non sostituire il servizio di persistenza con l’artifact. |
| D10 · Costruzione e controllo | Integrato | Integrato perché dichiarare Hosts, ambiente/tecnologia e separare ownership e collocazione; risultato atteso è poter indicare dove risiede ogni parte. |
| D11. Class: tipi, membri e relazioni del software | Già esplicito | Le domande sono risolte da attributi/metodi, contratti e dipendenze fra i tre tipi, distinti dai concetti dati. |
| D11 · Quando e perché usarlo | Già esplicito | Già esplicita l’utilità per un dominio/interfaccia mirati e il costo di copiare indiscriminatamente ogni classe. |
| D11 · Elementi e compartimenti | Già esplicito | Ruoli dei membri e differenza fra Attribute e Method sono espliciti; nomi/firme duplicati e parentesi spiegano già le scelte nei form. |
| D11 · Collegamenti | Integrato | Integrato perché dichiarare membri e dipendenze e confrontare rappresentazioni con mapping; direzioni e semantica di ereditarietà/composizione sono già spiegate. |
| D12. Use Case: obiettivi degli attori | Già esplicito | Le domande sono risolte da attori, obiettivi e necessità/opzionalità dei comportamenti, distinti dai passi UI. |
| D12 · Quando e perché usarlo | Già esplicito | Già spiega che concordare gli obiettivi precede la progettazione delle schermate e fornisce un esempio concreto. |
| D12 · Elementi | Già esplicito | La tabella e il proprietario Mercato spiegano partecipazione, confine e verso Include/Extend; la lettura del contenimento rende verificabile l’appartenenza. |
| D12 · Procedura e significato delle frecce | Integrato | Integrato il motivo delle singole associazioni e dei collegamenti Include/Extend vicino alle azioni; layout e controlli sono già collegati a leggibilità e distinzione obiettivi/passi. |
| D13. UML Component: responsabilità e contratti | Già esplicito | Le domande sono risolte da fornitore/consumatore, riuso del contratto e binding distinti dal solo collegamento grafico. |
| D13 · Quando e perché usarlo | Già esplicito | Già motiva la scelta per sostituibilità e contratti fra moduli, distinguendola dall’interno di un solo container C4. |
| D13 · Elementi e binding | Integrato | Integrato perché completare dati, esiti e obblighi di un contratto: chi lo usa deve conoscere più del nome dell’interfaccia. |
| D13 · Collegamenti e controllo | Integrato | Integrati motivo del riuso delle relazioni, dichiarazioni per compatibilità consumer/provider, diagnostiche prima della review e impatto sui chiamanti dopo una modifica alla firma. |
| D14. Package: moduli e direzione delle dipendenze | Già esplicito | Le domande sono risolte da layer logici, direzione dipendente→usato e riconoscimento dei cicli, distinti dalle unità distribuibili. |
| D14 · Quando e perché usarlo | Già esplicito | Già collega la vista alla decisione su moduli e layer anche in una singola applicazione. |
| D14 · Elementi e confini | Già esplicito | La tabella spiega raggruppamento, contenimento e dipendenza; testo distingue package da applicazione e da cartella fisica. |
| D14 · Costruzione e lettura | Integrato | Integrato perché orientare gli adapter verso regole/applicazione mantiene il dominio indipendente dai dettagli esterni; nomi, cicli e vincoli ADR sono già motivati. |
| D15. Data Flow: dati, trasformazioni e archivi | Già esplicito | Le domande sono risolte seguendo dati trasferiti, trasformazione e conservazione senza confonderli con chiamate nel tempo. |
| D15 · Quando e perché usarlo | Già esplicito | Già spiega quando i movimenti delle chiamate non chiariscono quali informazioni attraversano il sistema. |
| D15 · Elementi | Già esplicito | Tabella e nomi delle frecce distinguono dato, trasformazione e archivio; già spiega perché etichette come esegui non sono sufficienti. |
| D15 · Costruzione e controllo | Integrato | Integrato perché iniziare da input/risultato e poi leggere/scrivere archivi, precisando che è un ordine consigliato; motivato il mantenimento degli stessi ingressi/uscite nel dettaglio. |
| D16. Network / Infrastructure: connessioni e confini | Già esplicito | Le domande sono risolte da rete/applicazione, mezzi di comunicazione e provenienza progettata/osservata, distinti dalla collocazione. |
| D16 · Quando e perché usarlo | Già esplicito | Già collega la vista a raggiungibilità, esposizione e separazione dell’infrastruttura e richiede una provenienza riconoscibile. |
| D16 · Elementi e dettagli | Già esplicito | La tabella spiega tipi, ambiente e protocolli; testo motiva il lasciare aperte infrastrutture non provate anziché inventarle. |
| D16 · Procedura e controllo | Integrato | Integrato perché distinguere nodi/applicazioni, dichiarare protocolli e provenienza delle informazioni: rende valutabili integrazioni previste e scelte non ancora realizzate. |
| A1. Installazione e avvio | Integrato | Preparare soltanto l’ambiente richiesto prima di T1; distinto avvio del prodotto da esercizi del modello. |
| A1 · macOS e Linux | Integrato | Motivi dei comandi clone/checkout/nvm/setup/dev e delle dipendenze native; preservati prerequisiti e revisione. |
| A1 · Account e dati necessari | Integrato | Attività locali già distinte da IA; esplicitato che trust consente esecuzione di codice della cartella. |
| A2. File, workspace, editor e terminale | Integrato | IDE da aprire per confronto con file ed esecuzione; directory corrente motivata per evitare copia errata. |
| A2 · File e workspace | Integrato | Criteri di scelta per Explorer, workspace, editor affiancati, Save As/Save All/Auto Save; mantenuta distinzione codifica e storia. |
| A2 · Cercare e modificare | Integrato | Ricerca nel file/workspace, definizione/apertura rapida e strumenti di editing collegati a obiettivi; rinomina semantica già motivata. |
| A2 · Terminale e task | Integrato | npm test per attesi e npm start per demo; task per riuso della configurazione; terminali per attività distinte. |
| A3. Git, debug e test tecnici | Integrato | Tre strumenti scelti in base a conservazione, diagnosi o confronto con attesi. |
| A3 · Git | Integrato | Diff e stage per contenuto commit, push per condivisione, branch/stash per esperimenti/interruzioni, Git e Undo ADE distinti. |
| A3 · Debug tecnico | Già esplicito | Scopo già esplicito: breakpoint in calculateTotal per osservare quantity/total e spiegare esito inatteso; controllati dati nel sorgente. |
| A3 · Test tecnici e verifiche ADE | Integrato | Testing per esecuzione/diagnosi; criteri concreti per scegliere test codice o simulazioni; limiti provider conservati. |
| A4. Documenti, browser, personalizzazione e integrazioni | Integrato | Consultazione su bisogno concreto, strumenti non presentati come tutti necessari al percorso visuale. |
| A4 · Documenti e contenuti | Integrato | Anteprima per controllare resa del documento; notebook per testo/codice/risultati con kernel; Mermaid resta distinto dal modello. |
| A4 · Browser | Integrato | Uso condizionato a UI web o documentazione; ispezione e condivisione separate dalle capacità sempre disponibili. |
| A4 · Personalizzazione ed estensioni | Integrato | Ambito impostazioni scelto per effetto desiderato, profili per attività, estensioni per capacità mancante; log per diagnosi già esplicito. |
| A4 · Chat e MCP | Integrato | Chat generale/inline per ampiezza richiesta, allegati per contesto, review per intento; server MCP solo per capacità concreta. |
| A5. Accessibilità e uso da tastiera | Integrato | Motivi di selezione, layout e pan, lettura testuale per semantica oltre posizione; impostazioni e aiuto già motivati. |
| A6. Problemi comuni e recupero | Integrato | Controllati tutti i 24 sintomi/azioni: causa, dipendenza o scopo ora vicino al rimedio dove mancava; segnalazione per riproduzione. |
| A7. Garanzie, disponibilità e copertura della guida | Integrato | Matrici da usare per scegliere attività compatibile e delimitare prove nella consegna; contenuti e prerequisiti conservati. |
| A8. Glossario e riferimenti | Integrato | Glossario per distinguere risultati e formulare consegne/chiarimenti; fonti/versioni e limiti notazioni già spiegati. |
| A9. System Map: Atlante a livelli e filtri cumulativi | Integrato | Mappa per trovare contesto attore/capacità prima di scegliere identità o vista. |
| A9 · Dove aprire la mappa | Integrato | Tre accessi equivalenti con criterio pratico di scelta; non una sequenza obbligatoria. |
| A9 · Come leggere l’Atlante | Integrato | Gruppi per distinguere attori/capacità/condivisione; tabella controlli già esplicita su filtri e livelli. |
| A9 · Prova guidata: Cliente e Conferma acquisto | Integrato | Cinque istruzioni motivate; filtro area dichiarato esercizio facoltativo per capire rimozione indipendente, non vincolo tecnico. |
| A9 · Ricerca, relazioni e sistemi estesi | Integrato | Ricerca per nome vs livelli, Inspect vs vista; relazioni originali per valutare dipendenza specifica; paginazione mantiene contesto. |

### Export, verifica e riproduzione

Il PDF precedente di 81 pagine e il suo sorgente restano disponibili nel commit `ce5e7b4b`; gli originali già conservati nella cartella `originale` non sono stati sovrascritti. Il [verbale](VERIFICA-LABORATORIO.md) registra impaginazione e controlli di questa nuova edizione, distinguendoli dalle prove precedenti. Non sono state rieseguite l’applicazione o le sue procedure per questa integrazione editoriale.

Per riprodurre l’edizione con l’indicazione “scopi e motivazioni” in copertina e nei metadati, usa l’ambiente Python descritto sopra e questo comando dalla radice del repository:

```sh
/tmp/ade-guide-venv/bin/python ade/scripts/build-user-guide.py --revision 8a069e4b --edition "17 novembre 2026 · scopi e motivazioni"
```

## Laboratori IA e aggiornamento del workbench · 19 novembre 2026

L16 conserva il modulo, la demo e l’inventario locale. L17 usa `codice-ia` per seguire la scoperta di Acquisto e Resi, interrompere la generazione, riprenderla dal checkpoint e confrontare le due viste con il codice prima di applicare. L18 usa `moduli/generazione-ia` per generare la prima implementazione in una copia senza sorgenti o Git. Gli esercizi di aggiornamento, worktree e Sync restano accessibili quando il progetto soddisfa i loro prerequisiti.

L’edizione integra l’aggiornamento del laboratorio di `20028af9`, con l’editor Structural Blueprint persistente e i percorsi rivisti per importazione, worktree e Sync. Include una schermata di avanzamento e una di review, entrambe ottenute dai componenti ADE eseguiti in Chromium con dati sintetici Mercato. Il [verbale](VERIFICA-LABORATORIO.md#laboratori-ia-e-aggiornamento-del-workbench--19-novembre-2026) registra i riscontri locali e il limite del tentativo con un provider reale.

```sh
/tmp/ade-guide-venv/bin/python ade/scripts/build-user-guide.py --rebuild-examples \
  --revision "ADE desktop, aggiornamento del laboratorio su base 20028af9 e flussi IA di questa revisione" \
  --edition "19 novembre 2026 · Laboratorio e flussi IA"
```
