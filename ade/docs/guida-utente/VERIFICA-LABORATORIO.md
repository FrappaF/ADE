# Mercato: verifica del laboratorio da primo utilizzo

Verifica del 14 novembre 2026 su ADE desktop macOS, profilo isolato nuovo, cartella iniziale senza modello. Le funzionalità sono state ricavate dalla guida e dal catalogo fornito; i sorgenti ADE sono stati consultati soltanto per correggere il difetto di riuso delle relazioni già riprodotto nella UI. Il modello principale è stato costruito attraverso schede, menu, proprietà e form. Nessun edit manuale del JSON del progetto.

Il percorso principale ora porta a tre feature, 18 viste nei 16 tipi, sette tipi condivisi, un’operazione con input/risultato/errore, un contratto fornito da Checkout, un mapping e un’ADR. Le tappe L3 e L5 sono salvataggi effettivi della costruzione: non contengono più gli oggetti delle lezioni successive. I moduli eseguibili sono stati provati in copie complete, inclusi i casi indipendenti distribuiti.

## Risultati e correzioni

| Percorso verificato | Risultato iniziale / problema | Correzione applicata | Risultato dopo il controllo | Limiti rimasti |
| --- | --- | --- | --- | --- |
| L1-L2: cartella, creazione e tre feature | Root e cartella contenitore poco distinte; Add Feature scompare dopo la prima creazione | Tabella delle root; selettore del diagramma per le feature successive; ritorno ad Acquisto | Progetto creato da cartella vuota, salvato e riaperto | Le opzioni avanzate restano progressive |
| L2: primi elementi e collegamenti | Mancavano categorie dei tipi e conferma della condizione vuota | Percorsi Add Element; esempio completo Connect; Condition vuota con Invio | Sei schede e cinque relazioni costruite e riaperte | Fit Diagram serve quando il contenuto esce dall’inquadratura |
| L2: rinomina e layout | Nomi e percorsi dei menu incompleti | Contents > Rename Diagram; Layout and Display > Arrange Diagram > Balanced, poi Fit | Rinomina e disposizione verificate | Coordinate diverse dagli screenshot sono ammesse |
| L3: C4 Context e casi d’uso | Create New non apre la vista; vecchio comando di confine non esposto | Apertura esplicita della nuova vista; ownership dal blueprint; Mercato incluso nel Use Case | Soggetto, contesto e quattro casi con owner Mercato verificati | Nessuna esecuzione dedotta dalle frecce |
| L4: container e componenti | Ruoli indicati con nomi diversi dal form; Contract cercato nella panoramica; Invocation incompatibile con C4 Component | Web Client / Data Store; creazione Contract nella C4 Component; Communication per registra esito | Due livelli C4 e ownership validi, protocolli compilati | Scelte infrastrutturali didattiche |
| L5: ERD e schema | “Aggiungi attributi” saltava sei campi; Shared Types richiesti prematuramente; mapping troppo anticipato | Form completo, tipi descrittivi string/integer; nomi colonne digitati; mapping rinviato a L11 | Cinque entità / dieci attributi; cinque tabelle / quindici colonne; quattro associazioni e quattro FK | Non è una migrazione di un database |
| L6 e L9: riuso delle relazioni | Add Existing Element non includeva le relazioni; Connect duplicava l’identità | Aggiunto in ADE Add Existing Relationship, contestuale a Contents; riusa solo collegamenti compatibili fra estremi visibili | UML Component e Network completati; Undo/Redo, identità unica, viste originali e messaggio di lista vuota verificati | Sequence e State mantengono i rispettivi comandi dedicati |
| L6: Class, UML Component, Package | Class cercata nel gruppo sbagliato; Method saltava Key Kind senza indicazione | Class nel gruppo Data; form Method esplicito; tre relazioni nel Component | Membri, dipendenze e interfaccia condivisa verificati | Firme descrittive, non implementazioni |
| L7: Activity, Sequence e State | Partecipanti confusi con messaggi; ordine delle domande State non specificato | Add Existing Message e ordine dichiarato; risorsa prima del nome per State | Sette nodi / otto Control Flow; quattro partecipanti / tre messaggi; una risorsa / tre stati / due transizioni | Stati descrittivi distinti da macchina eseguibile |
| L8: Resi e impatto | Ownership del controller su un componente produceva una bozza invalida; ritorno da Impact non spiegato | Owner API Mercato; ritorno con Back della navigazione; condizioni esplicite del reso | Bozza corretta da form; rinomina condivisa Ordine cliente e Undo verificati | La regola dei 30 giorni è solo didattica |
| L9-L10: Deployment, Network, Data Flow e pulizia | Categorie avanzate mancanti; viste vuote e oggetti temporanei ingombravano la navigazione | Percorsi Infrastructure / Behavior; SQL riusato; conferma Delete Diagram; rimozione dalla sola panoramica | Tutte le prospettive aperte; soluzione finale con 18 viste / 16 tipi e nessuna diagnostica di validità | Layout automatico Deployment richiede ancora riordino manuale dei gruppi |
| L11: tipi e contratto | Operazione usata prima di crearla; owner Checkout non faceva comparire la firma nel Contract | Ordine dei tipi; owner Contratto acquisto; Interfaces and Invariants versione 1; selezione Checkout prima di Provided Interface | Tipi, firma, criterio Given/When/Then, interfaccia e porta fornita salvati e riaperti | Non equivale a un checkout eseguibile completo |
| L11: mapping, feature e ADR | Mancavano i passaggi concreti dei form | Domain Field Mapping diretto; Feature Memberships di Scorte; Number/Title/Context/Decision/Consequences/Scope per ADR | orderId → orders.id, Catalogo e ADR-001 verificati | ADR Proposed; nessun vincolo normativo inventato |
| L12: quantità, review, Apply e Undo | Conteggio finale incoerente con esercizi sequenziali; criterio vecchio dopo il limite | Zero e testo, poi 10/11; atteso massimo sicuro e Then aggiornati; soluzione con dodici casi | Base: 10 derivati + 10 indipendenti; limite: 12 + 12. Verifica passata, Apply e Undo reali. Variante finale riapplicata | Nessuna chiamata IA; generazione delimitata al profilo |
| L13: interazioni | Non distinto accesso dal canvas da quello della palette | Accesso contestuale; esercizio essenziale centrato sui sette casi forniti e lettura di opt | Review reale: sette derivati + sette indipendenti passati | Creazione di un nuovo scenario completo resta approfondimento |
| L14: stati eseguibili | Non spiegato che il risultato apre un documento nell’IDE | State Simulation.txt; riapertura della scheda Checkout Lifecycle prima di Back to Diagrams, verificata fino al canvas; esiti negativi espliciti | Paid/accepted; Draft/denied; Paid con accepted, duplicate e rejected/deliveryConflict osservati | Nessun monitoraggio di servizi vivi |
| L15: messaggi | Risultato e chiusura del selettore poco chiari | Campi, due osservazioni attese, Escape finale | Pubblicazione e workers:A:ordine-guida-1:1:ok osservati, senza rete | Retry e fan-out restano approfondimenti sulle policy |
| L16: codice e inventario | Prerequisito Node/cartella del terminale e ritorno dall’evidenza impliciti | Comandi nella root corretta; distinzione dichiarazione/riferimenti; riapertura della scheda Create Diagrams | Sette test passati; demo confirmed/2500; inventario pronto; validateQuantity aperta in orders.mjs | Inventario non equivale a modello interpretato |
| L17-L19: IA, worktree e Sync | Sembravano una prosecuzione garantita dell’importazione | Rami facoltativi; account, viste applicate, Git/criteri, formato/adapter e baseline espliciti; salto a L20 quando mancano | Apertura del compositore e chiusura senza inviare; nessuna nuova esecuzione remota | End-to-end IA/worktree/Sync non rieseguito in questa sessione |
| L20: reverse | Root e presenza dei sorgenti applicati non precisate; comando di test diverso dal modulo codice | Ritorno a quantità; percorso Code and Context; prova 10 → 9 → 10; node --test | Reverse riconosce 9, caso Limite 10 fallisce e Apply è disabilitato. Ripristino: Aligned / No Proposal; dodici test emessi passati | Runtime Bun e preparazione continua non attivati; selettori runtime e ingresso task controllati |
| L21: consegna | Checkpoint e soluzione non coincidevano con la costruzione manuale | Snapshot nativi nuovi; archivi rigenerati; documenti sincronizzati | Soluzione distribuita riaperta; tutti i modelli del pacchetto validi | Verifica con una persona esterna ancora da svolgere |

## Cambiamenti al codice

- Menu del canvas: Add Existing Relationship in Diagram > Contents, accanto ad Add Existing Element, per viste ordinarie modificabili.
- Editing: comando registrato e protezione delle prospettive derivate; elenco con origine, destinazione, nome e tipo; feedback quando non esistono candidati.
- Modello: edit includeRelation che modifica soltanto relationIds della vista, con controllo di compatibilità ed estremi già visibili; nessuna nuova relazione semantica.
- Verifiche: regressione su identità condivise, viste non coinvolte, inclusione ripetuta, rimozione e candidati non ammissibili.
- Documentazione: laboratorio L1-L21 corretto, atlante coerente con il modello nativo, nuova schermata del riuso e C4 Component aggiornato, esempi e archivi allineati.

## Controlli tecnici e materiali

Il client è stato ricompilato e riavviato prima del retest UI. ADE typecheck superato; 286 test del progetto superati (la verifica specifica delle identità è inclusa in questo totale). Le suite mirate visual editing / Sequence / State hanno superato 18 test. Il modulo JavaScript passa sette test e la demo; i file della quantità ripristinata passano dodici test indipendenti. I quattordici modelli distribuiti non presentano diagnostiche di validità.

HTML verificato offline a 1440, 1024, 768 e 390 pixel: nessun overflow orizzontale, nessun anchor mancante o duplicato, immagini caricate, ricerca e ingrandimento funzionanti. PDF renderizzato e controllato; immagini e tabelle leggibili. Archivi controllati per CRC, contenuti e corrispondenza con i file consegnati. Il kit non include profili, cache, credenziali o cronologie del provider.

## Questioni rimaste e priorità

1. **P1 · Primo utilizzo da validare con persone esterne.** Il test eseguito è una simulazione operativa di primo uso, non uno studio con utenti. Proposta: cinque persone, senza assistenza, dal primo progetto alla prima verifica della quantità; registrare punti di arresto e tempo al risultato.
2. **P1 · Ownership più preventiva.** La guida evita l’owner non ammesso per il controller e insegna il recupero della bozza. Proposta: filtrare o spiegare le scelte incompatibili nel form prima del salvataggio, mantenendo la possibilità di lavorare su una bozza.
3. **P2 · Layout Deployment.** Arrange Diagram può sovrapporre i gruppi di hosting; spostando i figli si separano i gruppi, ma gli ancoraggi delle frecce possono risultare distanti. Proposta: disporre gli host come gruppi e calcolare i collegamenti sulle loro posizioni visive. Il riordino manuale è indicato in L9; il motore di layout non è stato riscritto in questa revisione.
4. **Needs decision · Laboratorio Sync/worktree integralmente riproducibile.** I moduli locali non creano automaticamente i prerequisiti legacy. Proposta: aggiungere un progetto didattico dedicato con formato/adapter supportati, baseline ed esempi di criteri riconosciuti, oppure unificare il supporto con il percorso v5. La guida distingue questi rami e non inventa dati mancanti.
5. **Disponibilità esterne.** Provider, Bun, broker reali e tecnologie assistive su altre piattaforme richiedono ambienti e prove pertinenti. In questa sessione non sono state fatte ulteriori richieste reali al provider.

Il percorso principale ha ora istruzioni verificabili e risultati concreti. L’accessibilità documentale beneficia di indice, ricerca, testi alternativi e percorsi da tastiera; non costituisce una certificazione con screen reader. La gerarchia della guida separa costruzione, esercizi locali e rami condizionati. La responsività HTML è verificata alle quattro larghezze sopra; la qualità visuale dei diagrammi resta dipendente anche dal layout della singola vista.

## Aggiornamento System Map · 16 novembre 2026

Aggiornati i riferimenti in T4 e A6 e la nota di edizione in A8. La nuova sezione A9 documenta i punti di accesso alla mappa, l’Atlante a livelli, i filtri cumulativi, la rimozione indipendente dei criteri, la navigazione mediante frecce, la ricerca globale e le relazioni originali. Le tre nuove immagini mostrano il renderer effettivo con il modello Bottega Ordini incluso nei progetti di esempio.

Il PDF contiene ora 79 pagine e 57 segnalibri; il collegamento A9 nell’indice e il rimando in T4 portano a pagina 77. La nuova sezione occupa le pagine 77–79. Il corpo e le posizioni del testo delle altre pagine originali sono stati confrontati con l’edizione precedente, escludendo copertina, indice, passaggi aggiornati e piè di pagina. Sono state controllate visivamente le pagine modificate e le tre nuove pagine.

La versione HTML comprende 52 capitoli e 35 immagini. Indice, ricerca e ingrandimento delle nuove schermate vengono verificati nel browser. Il kit utente contiene le versioni aggiornate di PDF, HTML, testo e immagini; l’archivio dei progetti di esempio conserva gli stessi contenuti.

## Revisione delle motivazioni · 17 novembre 2026

Riletti tour, laboratorio, atlante e appendici chiedendo per ogni procedura quale problema risolve e perché adotta quelle scelte. Chiariti in particolare prospettive dei diagrammi, identità condivise, ownership, cardinalità, contratti, casi indipendenti e ordine review/verifica/applicazione. Le spiegazioni precedono le istruzioni o ne completano le frasi esistenti; titoli, tabelle e blocchi di codice sono invariati. Il testo cresce di circa il 4,5%.

Rigenerati HTML e PDF dalla sorgente aggiornata. Il PDF ha 80 pagine, rispetto alle 79 precedenti, con 57 segnalibri e 35 immagini: controllati presenza dei testi, tabelle e comandi, destinazioni dei collegamenti, limiti della pagina e impaginazione. L’HTML conserva 52 capitoli, 51 tabelle e 35 immagini; verificati localmente, senza richieste esterne, caricamento immagini, assenza di overflow, ricerca, indice e ingrandimento a 1440, 1024, 768 e 390 pixel. Controllati CRC e corrispondenza dei file del kit con quelli consegnati. Questa revisione riguarda i documenti e le esportazioni; le esecuzioni ADE sono quelle registrate nelle sezioni precedenti.

## Introduzioni con domande · 17 novembre 2026

Tutti i 52 capitoli si aprono ora con un paragrafo di 25–41 parole che introduce il problema e anticipa due o tre domande affrontate nel testo. L2 parte dalle feature di Mercato e chiede come rappresentarle, scegliere elementi e collegamenti e organizzare il progetto. Nell’atlante le domande sono all’inizio del capitolo, senza ripeterle nella sezione sul momento d’uso. Titoli, tabelle e blocchi di codice restano invariati; rispetto alla revisione precedente il testo cresce del 2,8%.

Rigenerati HTML e PDF: 83 pagine, 57 segnalibri e 35 immagini. Verificati corrispondenza dei contenuti con la sorgente, presenza di ogni introduzione nella stessa pagina del titolo, collegamenti e limiti della pagina; controllate visivamente aperture del laboratorio, dell’atlante e delle appendici. Nell’HTML le introduzioni precedono le procedure in tutti i capitoli; ripetute le verifiche locali di immagini, overflow, ricerca, indice e ingrandimento a 1440, 1024, 768 e 390 pixel. Controllati CRC e corrispondenza dei 41 file del kit. La verifica riguarda documenti ed esportazioni; gli esercizi ADE rimangono quelli già documentati.

## Allineamento a main · 17 novembre 2026

Confrontata la guida con `origin/main` aggiornato tramite fetch, commit `ae62531ca42ce3abd9923140a127c1cd77d08e35`. Esaminati il wizard e la sidebar introdotti da `ae62531c`, i casi d’uso aggiornati da `24f01110` e i precedenti interventi su importazione e aggiornamento dei diagrammi.

| Cambiamento verificato | Allineamento della guida |
| --- | --- |
| Structural Blueprint usa Choose, Configure e Review | L3 introduce ricerca delle attività, Next, Edit, Apply Changes, Back e annullamento; aggiornati i percorsi C4, tipi, operazioni, interfacce, mapping, appartenenze e ADR in L3-L4, L8, L11-L12 e D0-D4 |
| L’accesso generale chiede il target; le azioni specifiche delle proprietà lo conservano | Esplicitato Element prima di owner, appartenenze e interfaccia fornita; distinti target e proprietario |
| Le modifiche restano separate dal modello fino ad Apply Changes | Rimossi conferme con OK e salvataggi impliciti dal blueprint; distinta l’applicazione al modello dalla scrittura dei sorgenti di L12 |
| Il selettore dei proprietari ammette le categorie compatibili ed esclude i cicli | L8 presenta API Mercato come scelta del laboratorio, senza imporre un vincolo generale al solo container |
| Sidebar verticale e New con Structural Blueprint | Aggiornati T1, T4, A9 e INIZIA-QUI; riscontri nel codice e nelle asserzioni di adeView.test.ts |
| Ovali Use Case e nomi centrati | Aggiornati L3, D12 e la schermata atlante-12; mantenuto il modello didattico originale |

Verificati nel browser i componenti TypeScript e CSS effettivi di main, usando il modello Mercato distribuito: scope da accesso generale e contestuale, annullamento, C4 con soggetto/contesto/visibili, tipo condiviso con modifica dal riepilogo, ownership, interfaccia fornita, mapping e ADR con scope esplicito. Controllate l’assenza di modifiche prima della conferma e l’applicazione degli edit tramite la funzione originale. Il renderer Use Case mostra quattro nomi contenuti negli ovali e cinque collegamenti. Le nuove immagini del wizard e dei casi d’uso provengono da questi componenti, con adattatori per DOM, localizzazione e focus; questa verifica è limitata ai componenti browser, senza una nuova esecuzione completa del desktop.

Rigenerati PDF e HTML, conservando le 52 introduzioni con domande. Il PDF contiene 85 pagine, 57 segnalibri e 36 immagini; controllati testi, destinazioni dei collegamenti, limiti della pagina e impaginazione. Nell’HTML verificati corrispondenza di testi e immagini con i file consegnati, indice, ricerca, ingrandimento e assenza di overflow a 1440, 1024, 768 e 390 pixel. Il kit contiene 42 file aggiornati e verificati per corrispondenza e CRC; progetti di esempio e blocchi di codice della guida sono invariati rispetto alla revisione precedente.
