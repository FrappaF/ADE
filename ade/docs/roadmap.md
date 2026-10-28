# Roadmap A.D.E

A.D.E punta a rendere il modello visuale l'ambiente quotidiano del software engineer: progettazione, esplorazione, implementazione assistita dall'IA e verifica del comportamento. La [visione](vision.md) definisce il prodotto; questa roadmap descrive come arrivarci in incrementi verificabili.

Le milestone indicano un ordine di sviluppo, non date di consegna. La fondazione M0 comprende il fork Code OSS, la shell nativa e il collaudo desktop su Linux. La chiusura complessiva resta subordinata alla verifica macOS prevista in M0.1. Le scelte tecnologiche riportate per le fasi successive sono proposte iniziali da validare.

## Decisione di base: un prodotto desktop autonomo

A.D.E viene sviluppato modificando direttamente il fork Code OSS. Il workbench visuale, la navigazione del sistema e i servizi di coordinamento sono parti del prodotto. L’estensione in `ade/prototype/` resta un laboratorio di validazione delle interazioni; la sua esecuzione non certifica il funzionamento dell’applicazione desktop.

L’editor testuale, il terminale e gli strumenti tecnici restano disponibili per manutenzione e approfondimenti. L’esperienza ordinaria parte dal modello del sistema e permette di completare il percorso supportato senza aprire il sorgente. La [decisione architetturale](decisions/0001-code-oss-fork.md) e la [guida al fork](fork-development.md) definiscono la base adottata.

## Percorso e dipendenze

| Milestone | Risultato | Dipende da | Stato |
| --- | --- | --- | --- |
| M0 · Fondazione | Build riproducibile, shell A.D.E e manutenzione upstream | — | M0.2 e M0.3 verificate su Linux; M0.1 attende macOS/CI |
| M1 · Modello semantico | Contratto condiviso del sistema | M0 | Da sviluppare |
| M2 · Editor visuale | Creazione e modifica senza JSON | M1 | Da sviluppare |
| M3 · Esploratore | Navigazione dal sistema alla singola feature | M1, M2 | Da sviluppare |
| M4 · Ponte con il codice | Importazione e tracciabilità | M1, M3 | Da sviluppare |
| M5 · Collaborazione IA | Prima feature implementata dal modello | M2, M4 | Da sviluppare |
| M6 · Riconciliazione | Modello e codice aggiornati in entrambe le direzioni | M4, M5 | Da sviluppare |
| M7 · Ambiente dinamico | Esecuzione e diagnostica nel modello | M3, M5, M6 | Da sviluppare |
| M8 · Beta utilizzabile | Progetto completo sul perimetro supportato | M2–M7 | Da sviluppare |
| M9 · Espansione | Altri adattatori, piattaforme e collaborazione | M8 | Da valutare |

Il primo traguardo end-to-end è completare una feature di acquisto: attore → interfaccia → controller → pagamento → ordine, inclusi errori e verifiche. Questo scenario accompagnerà tutte le milestone.

## M0 — Fondazione del fork Code OSS

**Disponibile:** sorgenti e revisione upstream registrati, identità di sviluppo separata, home A.D.E nativa nel workbench, modello dimostrativo in sola lettura, navigazione delle proprietà e contesto persistente per workspace. Il laboratorio in `ade/prototype/` conserva il JSON minimale, la webview e i test del modello.

**Limiti:** demo statica, nessuna modifica dal canvas, analisi della codebase o implementazione IA. Le funzioni future sono indicate come indisponibili. Le funzioni Copilot upstream non configurate sono disabilitate per impostazione predefinita.

**Esiti:** build di sviluppo, smoke desktop con riavvio, test nell’Extension Host e prova di aggiornamento upstream verificati su Linux x64. Stato dettagliato e limiti in [verifica M0](m0-validation.md), personalizzazioni e servizi in [inventario del fork](fork-inventory.md). M0 non è dichiarata interamente conclusa finché non sono verificate le voci macOS di M0.1.

### M0.1 — Toolchain e primo desktop funzionante · parziale

**Attività:**

- [x] Selezionare Node 24.22.1 da `.nvmrc` e predisporre una toolchain nativa compatibile per Linux x64.
- [ ] Ripristinare e collaudare Xcode/Command Line Tools sul Mac di sviluppo originale.
- [x] Compilare il client di sviluppo dello snapshot e avviare A.D.E su Linux con profilo, estensioni, dati condivisi e configurazione argv isolati.
- [ ] Confermare build desktop, typecheck del contributo A.D.E e smoke nella CI macOS. Il typecheck globale upstream richiede una macchina con più memoria rispetto al cloud da 8 GiB.
- [x] Verificare su Linux apertura workspace, ripristino della finestra e della selezione, comando della home e caricamento del prototipo come estensione di sviluppo.
- [x] Documentare prerequisiti e procedura da clone pulito, piattaforma, revisione, comandi e limiti del collaudo.
- [x] Aggiungere CI desktop Linux/macOS separata dai test leggeri, con artifact delle schermate. Esecuzione remota ancora da avviare: il push richiede l’autorizzazione alla pubblicazione.

**Consegna:** istruzioni riproducibili e primo avvio desktop verificato. La piattaforma iniziale proposta resta macOS arm64; Linux x64 è stato collaudato nell’ambiente cloud. Il risultato Linux non certifica il Mac originale.

**Criterio di completamento:** un clone pulito viene compilato e avviato seguendo la guida; lo smoke test del workbench passa. Un workflow che verifica soltanto `ade/prototype/` non soddisfa questo criterio.

### M0.2 — Shell e identità del prodotto A.D.E · completata su Linux

**Dipende da:** M0.1. La progettazione dell’interfaccia può procedere durante la preparazione della toolchain; il collaudo richiede il desktop funzionante.

**Attività:**

- [x] Definire home di progetto, area centrale del modello, esploratore semantico, proprietà e pannello della collaborazione IA.
- [x] Integrare nel workbench un primo contributo A.D.E con comandi, apertura della vista e navigazione persistente.
- [x] Impostare il percorso iniziale «Crea progetto / Apri progetto / Importa codebase», distinguendo le operazioni disponibili da quelle ancora da implementare.
- [x] Completare il branding per lo sviluppo e isolare profili, impostazioni e dati rispetto ad altre installazioni dell’editor.
- [x] Conservare l’accesso agli strumenti tecnici senza renderlo necessario per la navigazione ordinaria.
- [x] Definire i confini fra contributi UI, servizi semantici, adattatori e coordinatore IA rispettando la struttura a livelli upstream.

**Consegna:** shell desktop A.D.E navigabile, inizialmente con una vista del modello dimostrativo. La shell non equivale ancora all’editor visuale di M2.

**Criterio di completamento:** aprendo un workspace dimostrativo si accede alla vista A.D.E, si cambia pannello e si ripristina il contesto dopo il riavvio. Le funzionalità future non simulano operazioni riuscite.

### M0.3 — Gestione del fork e integrazione continua · verificata su Linux

**Attività:**

- [x] Definire la strategia di aggiornamento dallo snapshot registrato in `ade/upstream.json`, con confronto delle revisioni e branch dedicati.
- [x] Inventariare le modifiche A.D.E al core e mantenere separati, dove possibile, i contributi specifici dal codice upstream.
- [x] Verificare un aggiornamento upstream su un branch di prova e documentare riconciliazione e ritorno alla versione precedente.
- [x] Mantenere disattivati i workflow Microsoft non configurati per ADE; attivare soltanto controlli pertinenti e riproducibili.
- [x] Inventariare servizi esterni, estensioni integrate e riferimenti di prodotto da configurare, sostituire o rimuovere prima della distribuzione.

**Consegna:** procedura di manutenzione del fork e CI iniziale del desktop. Firma e aggiornamenti agli utenti appartengono alla fase di distribuzione M8.

**Criterio di completamento:** la revisione di base e le personalizzazioni sono identificabili; un aggiornamento di prova supera build e smoke test, oppure presenta conflitti documentati senza compromettere il branch principale.

**Prova effettuata:** delta `98da3bad` → `915c6fae` applicato su branch dedicato senza conflitti; build di sviluppo e smoke superati, 54 test upstream superati, ritorno al branch di base verificato. [Report](upstream-trial-2026-10-28.json). La base di lavoro resta `98da3bad`; l’aggiornamento di prova non è stato integrato.

## M1 — Modello semantico e contratti

**Obiettivo:** rappresentare il significato del sistema indipendentemente dalla posizione dei nodi e dal framework.

**Attività:**

- Definire elementi per feature, attori, componenti, risorse, viste, controller, contratti, azioni e stati.
- Definire relazioni tipizzate: invocazione, dipendenza, lettura/scrittura, transizione e realizzazione.
- Modellare input/output, condizioni, errori, autorizzazioni e criteri di accettazione.
- Separare semantica, layout delle viste e mappatura verso il codice.
- Introdurre identificatori stabili, schema versionato, validazione e migrazione dei file.
- Distinguere intento progettuale, implementazione osservata e comportamento verificato.

**Consegna:** schema documentato, API del modello, esempi validi e invalidi, migrazione dell'esempio attuale e confine del servizio semantico consumabile dal workbench. La logica di dominio deve poter essere verificata senza avviare Electron.

**Criterio di completamento:** un elemento mantiene identità e relazioni quando viene rinominato o spostato; riferimenti mancanti e relazioni incompatibili producono diagnostiche comprensibili.

## M2 — Editor visuale persistente

**Obiettivo:** progettare senza modificare JSON.

**Attività:**

- Integrare un editor visuale nel workbench del fork con canvas, selezione, zoom, pan e spostamento dei nodi.
- Collegare il documento visuale al ciclo di vita degli editor e ai servizi di file, salvataggio e cronologia di Code OSS, riusando le infrastrutture esistenti.
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
- Completare test di integrazione del workbench, dei servizi A.D.E e degli eventuali componenti nell’Extension Host, oltre agli scenari end-to-end del desktop.
- Documentare capacità supportate, limiti e gestione dei problemi.
- Completare icone, identificatori applicativi, licenze, avvisi di terze parti e configurazione dei servizi esterni.
- Produrre un pacchetto installabile per la piattaforma iniziale, con firma e notarizzazione dove richieste dal canale scelto.
- Definire aggiornamenti, ripristino della versione precedente e compatibilità dei documenti e dei profili fra versioni.
- Raccogliere feedback di utilizzo sul flusso visuale e correggere i punti che richiedono accesso al sorgente.

**Consegna:** applicazione desktop A.D.E beta installabile, progetto dimostrativo e guida al percorso completo.

**Criterio di completamento:** un utente può installare e avviare A.D.E su una macchina di prova, creare o importare il progetto supportato, esplorare una feature, cambiarne il flusso con l'IA, verificare l'esecuzione e riconciliare una successiva modifica esterna. Nessuna perdita di dati negli scenari di recupero previsti.

## M9 — Altri stack, piattaforme e collaborazione

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
- Desktop: build e smoke test pertinenti alle modifiche del workbench; i test del prototipo non sostituiscono quelli del prodotto.
- Manutenzione: revisione upstream tracciata, personalizzazioni identificabili e aggiornamenti del fork verificabili.

## Decisioni da prendere e prossimo incremento

Prima di M4/M5 vanno scelti stack dimostrativo, provider IA e politiche di esecuzione e invio dei dati. Prima della beta vanno definiti licenza, distribuzione e obiettivi misurabili di prestazione. Le decisioni architetturali saranno registrate con motivazione e conseguenze.

## Ordine operativo dei prossimi incrementi

1. **Chiusura M0.1:** autorizzare la pubblicazione del branch, eseguire la CI desktop e verificare toolchain/avvio sul Mac originale. Il desktop di sviluppo è già avviabile e collaudato su Linux.
2. **M0.2 completata su Linux:** home, demo, proprietà e navigazione persistente sono disponibili nel workbench.
3. **M0.3 verificata su Linux:** inventario, CI configurata e prova upstream documentata; conservare le stesse verifiche per gli aggiornamenti futuri.
4. **M1:** definire il modello semantico del checkout e i suoi contratti. Risultato: dati condivisi fra editor, esploratore e futuri agenti.
5. **Prima porzione di M2:** creare, collegare, modificare e salvare attore, feature e risorsa dal canvas. Risultato: prima sessione di progettazione senza modificare JSON.

La prima dimostrazione utile sarà quindi un’applicazione A.D.E compilata dal fork in cui il developer apre un progetto, disegna un piccolo flusso e lo ritrova dopo il riavvio. L’implementazione assistita dall’IA e la sincronizzazione con il codice saranno aggiunte nelle milestone successive, con i rispettivi criteri di verifica.
