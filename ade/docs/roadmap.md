# Roadmap A.D.E

A.D.E punta a rendere il modello visuale l'ambiente quotidiano del software engineer: progettazione, esplorazione, implementazione assistita dall'IA e verifica del comportamento. La [visione](vision.md) definisce il prodotto; questa roadmap descrive come arrivarci in incrementi verificabili.

Le milestone indicano un ordine di sviluppo, non date di consegna. La fondazione M0 comprende ora anche l’importazione dei sorgenti Code OSS; la build desktop resta da verificare. Le scelte tecnologiche riportate per le fasi successive sono proposte iniziali da validare.

## Percorso e dipendenze

| Milestone | Risultato | Dipende da | Stato |
| --- | --- | --- | --- |
| M0 · Fondazione | Sorgenti Code OSS, branding iniziale e prototipo | — | Sorgenti importati; build e verifica UI da completare |
| M1 · Modello semantico | Contratto condiviso del sistema | M0 | Da sviluppare |
| M2 · Editor visuale | Creazione e modifica senza JSON | M1 | Da sviluppare |
| M3 · Esploratore | Navigazione dal sistema alla singola feature | M1, M2 | Da sviluppare |
| M4 · Ponte con il codice | Importazione e tracciabilità | M1, M3 | Da sviluppare |
| M5 · Collaborazione IA | Prima feature implementata dal modello | M2, M4 | Da sviluppare |
| M6 · Riconciliazione | Modello e codice aggiornati in entrambe le direzioni | M4, M5 | Da sviluppare |
| M7 · Ambiente dinamico | Esecuzione e diagnostica nel modello | M3, M5, M6 | Da sviluppare |
| M8 · Beta utilizzabile | Progetto completo sul perimetro supportato | M2–M7 | Da sviluppare |
| M9 · Espansione | Altri adattatori e distribuzione dedicata | M8 | Da valutare |

Il primo traguardo end-to-end è completare una feature di acquisto: attore → interfaccia → controller → pagamento → ordine, inclusi errori e verifiche. Questo scenario accompagnerà tutte le milestone.

## M0 — Fondazione del fork Code OSS

**Disponibile:** sorgenti Code OSS nella radice, revisione upstream registrata, primo branding A.D.E e prototipo separato in `ade/prototype/`. Il prototipo include comando VS Code, validazione di un modello JSON minimale, vista strutturale con aggiornamento dal documento, esempio di acquisto, test del modello e workflow CI.

**Limiti:** layout fisso, nessuna modifica dal canvas, nessuna analisi della codebase o chiamata IA. La vista attuale non è un editor UML completo.

**Verifica di uscita:** selezionare Node da `.nvmrc`, ripristinare la toolchain nativa, installare le dipendenze, compilare e avviare il desktop A.D.E; controlli Node del prototipo superati; avvio manuale nell'Extension Development Host, apertura dell'esempio e aggiornamento del diagramma verificati. I controlli automatici sono già eseguibili; il collaudo nell'host VS Code resta da effettuare.

## M1 — Modello semantico e contratti

**Obiettivo:** rappresentare il significato del sistema indipendentemente dalla posizione dei nodi e dal framework.

**Attività:**

- Definire elementi per feature, attori, componenti, risorse, viste, controller, contratti, azioni e stati.
- Definire relazioni tipizzate: invocazione, dipendenza, lettura/scrittura, transizione e realizzazione.
- Modellare input/output, condizioni, errori, autorizzazioni e criteri di accettazione.
- Separare semantica, layout delle viste e mappatura verso il codice.
- Introdurre identificatori stabili, schema versionato, validazione e migrazione dei file.
- Distinguere intento progettuale, implementazione osservata e comportamento verificato.

**Consegna:** schema documentato, API del modello, esempi validi e invalidi, migrazione dell'esempio attuale.

**Criterio di completamento:** un elemento mantiene identità e relazioni quando viene rinominato o spostato; riferimenti mancanti e relazioni incompatibili producono diagnostiche comprensibili.

## M2 — Editor visuale persistente

**Obiettivo:** progettare senza modificare JSON.

**Attività:**

- Integrare un editor visuale nel workbench del fork con canvas, selezione, zoom, pan e spostamento dei nodi.
- Definire home A.D.E, navigazione semantica e layout iniziale del prodotto; usare il prototipo per validare le interazioni.
- Aggiungere palette degli elementi, collegamenti e pannello delle proprietà.
- Integrare salvataggio, stato modificato, undo/redo e riapertura del documento.
- Offrire layout automatico di base e conservare le posizioni scelte dall'utente.
- Gestire documento non valido, aggiornamenti esterni e recupero dagli errori.
- Consentire operazioni principali da tastiera e rispettare tema e contrasto dell'editor.

**Consegna:** editor della vista strutturale con operazioni di creazione, modifica e cancellazione coerenti.

**Criterio di completamento:** creare il modello di acquisto interamente dal canvas, annullare e ripetere una modifica, salvare e riaprire senza perdere proprietà o relazioni. La cancellazione di un elemento deve gestire esplicitamente i riferimenti coinvolti.

## M3 — Esplorazione del sistema e viste coordinate

**Obiettivo:** approfondire qualsiasi feature, risorsa, vista e controller restando nel contesto visuale.

**Attività:**

- Aggiungere mappa del sistema, ricerca, filtri, breadcrumb e cronologia di navigazione.
- Collegare schede di dettaglio a responsabilità, contratti, dipendenze, dati ed errori.
- Introdurre progressivamente viste di struttura/classi, attività, sequenza e stato sullo stesso modello.
- Mostrare percorsi fra attore, interfaccia, logica applicativa e risorse.
- Visualizzare impatto di una modifica e distinguere elementi progettati, implementati e verificati.

**Consegna:** esploratore semantico e prime viste coordinate, con copertura dichiarata dei costrutti UML supportati.

**Criterio di completamento:** partendo da «Conferma acquisto», raggiungere pagamento, ordine, errori e relativi contratti senza aprire il codice. Una modifica a un elemento condiviso deve riflettersi in tutte le viste interessate.

## M4 — Adattatore iniziale e tracciabilità del codice

**Obiettivo:** collegare il modello a una codebase reale prima di delegare modifiche all'IA.

**Attività:**

- Scegliere un primo perimetro TypeScript e un solo stack dimostrativo; documentarne le capacità.
- Analizzare la struttura sintattica del codice per ricavare simboli, dipendenze e contratti supportati.
- Mantenere mappature fra identificatori semantici e simboli/file, comprese rinomine e spostamenti.
- Importare una codebase di esempio e segnalare esplicitamente costrutti non rappresentabili.
- Rilevare cambiamenti esterni e calcolare un impatto preliminare senza riscrivere i file.

**Consegna:** primo adattatore di analisi, codebase dimostrativa e mappa modello/codice ispezionabile.

**Criterio di completamento:** importare il progetto campione, navigarne gli elementi e rilevare una modifica manuale a un contratto. Gli elementi non supportati devono rimanere conservati e riconoscibili.

## M5 — Collaborazione con l'IA e prima implementazione

**Obiettivo:** trasformare un intento visuale in una modifica funzionante e verificabile.

**Attività:**

- Definire un'interfaccia per i provider IA e una configurazione delle credenziali fuori dai file versionati.
- Fornire all'agente modello, contesto della feature, vincoli e porzioni pertinenti della codebase.
- Presentare piano, domande sulle ambiguità e impatto sul sistema prima dell'esecuzione.
- Applicare le modifiche in un ambiente recuperabile, con controlli sulle operazioni eseguibili.
- Generare o aggiornare test legati ai criteri di accettazione ed eseguirli.
- Mostrare esito, differenze funzionali, costi disponibili e possibilità di annullare l'operazione.
- Dichiarare quali dati vengono inviati al provider e gestire timeout, cancellazione e fallimenti parziali.

**Consegna:** percorso assistito dal modello alla prima feature implementata sullo stack scelto.

**Criterio di completamento:** aggiungere visualmente il percorso «pagamento rifiutato», ottenere implementazione e test, eseguire le verifiche e poter ripristinare lo stato precedente. Un test fallito non deve essere presentato come completamento riuscito.

## M6 — Sincronizzazione bidirezionale e conflitti

**Obiettivo:** mantenere coerenti modello e codebase quando una modifica nasce da uno dei due lati.

**Attività:**

- Introdurre revisioni comuni, origine delle modifiche e registro delle operazioni.
- Confrontare versione comune, modello corrente e codice corrente per riconciliare cambiamenti concorrenti.
- Gestire entrambe le direzioni: modello → implementazione e codice → modello/viste.
- Distinguere trasformazioni deterministiche da interpretazioni IA che richiedono chiarimenti.
- Prevenire cicli di aggiornamento e riscritture dovute al solo layout o alla formattazione.
- Conservare codice personalizzato e gestire conflitti, cancellazioni e rinomine senza perdita silenziosa.
- Esporre stati: allineato, in attesa, in riconciliazione, in conflitto, verifica fallita.

**Consegna:** motore di riconciliazione sul perimetro dell'adattatore iniziale e interfaccia visuale di risoluzione dei conflitti.

**Criterio di completamento:** superare scenari di modifica dal diagramma, modifica dal codice, modifica concorrente dello stesso contratto, rinomina, cancellazione e interruzione a metà operazione. Ogni scenario deve terminare in uno stato coerente o in un conflitto esplicito e recuperabile.

La sincronizzazione universale di qualsiasi linguaggio e framework non è un criterio di questa milestone: la copertura deve essere dichiarata e verificata per ogni adattatore.

## M7 — Esecuzione, test e diagnostica visuale

**Obiettivo:** comprendere il comportamento effettivo del software attraverso il modello.

**Attività:**

- Avviare e fermare l'applicazione dimostrativa dall'ambiente.
- Collegare test, log, errori e tracce agli identificatori delle feature coinvolte.
- Distinguere flusso previsto e percorso osservato in una specifica esecuzione.
- Visualizzare guasti nelle interazioni e dipendenze coinvolte.
- Filtrare informazioni sensibili e controllare raccolta e conservazione delle tracce.

**Consegna:** pannello di esecuzione e diagnostica collegato alle viste della feature.

**Criterio di completamento:** simulare un errore di pagamento, individuare il passaggio fallito nel modello, chiedere una correzione e verificarne il risultato senza leggere il codice. L'assenza di tracce non deve essere interpretata come prova di correttezza.

## M8 — Beta end-to-end

**Obiettivo:** rendere utilizzabile il percorso completo da un nuovo progetto alla verifica di una feature.

**Attività:**

- Integrare onboarding, creazione/importazione del progetto e configurazione dell'adattatore/IA.
- Verificare persistenza, migrazioni, recupero, accessibilità e prestazioni su progetti campione di dimensioni crescenti.
- Completare test di integrazione nell'Extension Host e scenari end-to-end.
- Documentare capacità supportate, limiti e gestione dei problemi.
- Completare branding, licenze, firma e modalità di distribuzione del prodotto desktop.
- Raccogliere feedback di utilizzo sul flusso visuale e correggere i punti che richiedono accesso al sorgente.

**Consegna:** applicazione desktop A.D.E beta installabile, progetto dimostrativo e guida al percorso completo.

**Criterio di completamento:** un utente può creare o importare il progetto supportato, esplorare una feature, cambiarne il flusso con l'IA, verificare l'esecuzione e riconciliare una successiva modifica esterna. Nessuna perdita di dati negli scenari di recupero previsti.

## M9 — Altri stack e ambiente dedicato

**Obiettivo:** ampliare A.D.E senza compromettere coerenza e affidabilità.

**Attività:**

- Formalizzare l'SDK degli adattatori e i test di compatibilità per analisi, generazione e riconciliazione.
- Aggiungere un secondo stack per verificare quali concetti del modello sono realmente indipendenti dalla tecnologia.
- Estendere le viste UML e la modellazione di interfacce, dati, eventi e distribuzione secondo necessità concrete.
- Valutare collaborazione multiutente e riconciliazione delle modifiche condivise.
- Ampliare la distribuzione Code OSS già adottata: ulteriori piattaforme, canali di aggiornamento ed ecosistema delle estensioni.

**Criterio di completamento:** ogni nuovo stack supera gli stessi scenari di coerenza e recupero del primo, con limiti documentati. La distribuzione dedicata è già la direzione adottata; l’espansione delle piattaforme dipende dai risultati della beta.

## Verifiche trasversali

Ogni milestone deve aggiornare documentazione ed esempi e includere verifiche proporzionate al comportamento introdotto. In particolare:

- Identità e semantica: riferimenti stabili e nessuna divergenza silenziosa fra viste.
- Persistenza: operazioni ripristinabili e compatibilità dei documenti versionati.
- IA: contesto esplicito, credenziali protette, cancellazione e fallimenti comprensibili.
- Riconciliazione: conservazione delle modifiche manuali e stato di allineamento attendibile.
- Esperienza: operazioni comprensibili dal modello, senza imporre la lettura del sorgente.

## Decisioni da prendere e prossimo incremento

Prima di M4/M5 vanno scelti stack dimostrativo, provider IA e politiche di esecuzione e invio dei dati. Prima della beta vanno definiti licenza, distribuzione e obiettivi misurabili di prestazione. Le decisioni architetturali saranno registrate con motivazione e conseguenze.

**Prossimo incremento concreto:** completare la build e l’avvio del fork (M0), poi M1 e una prima porzione di M2. Definire il modello semantico del checkout e consentire di creare, collegare, modificare e salvare attore, feature e risorsa dal canvas. Questo fornisce una base verificabile per l'esploratore e la successiva collaborazione IA.
