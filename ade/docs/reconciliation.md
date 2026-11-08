# Riconciliazione bidirezionale M6

Il modello IA propone le trasformazioni **codice → modello/diagrammi** e **modello/diagrammi → codice**. Il motore non dipende dal linguaggio: importer, parser, compilatori, indici SCIP, validazione del modello e hash forniscono fatti e controlli alla proposta. Nessuna rinomina o implementazione viene scelta autonomamente dagli strumenti deterministici.

Il [percorso diagrammi e Codex](diagram-workflow.md) descrive l’importazione semantica in due passi e i comandi principali semplificati. Il percorso tecnico seguente resta disponibile da **More Tools → Sync Project**.

## Percorso nativo avanzato

1. Salvare il modello e scegliere **Sync Project**. La prima analisi è locale e non chiama provider.
2. Se modello e codice sono cambiati sullo stesso contratto, aprire **Review Conflicts**, confrontare versione comune, modello e codice e scegliere quale intento preservare. La scelta entra nel contesto IA; non sovrascrive direttamente i file.
3. Scegliere **Reconcile with AI**, selezionare i file da condividere e rivedere il payload completo, lo schema atteso e le metriche. Sono riusati provider, CLI originale, modello, login e budget configurati in M5. Un budget zero prepara soltanto il contesto.
4. **Propose Reconciliation** esegue al massimo una chiamata per revisione. Un contesto identico può riusare la proposta nella cache di processo, indicando il riuso e zero nuovi token. Domande, errori di schema e verifiche fallite non abilitano Apply. Le risposte alle domande richiedono un nuovo contesto esplicitamente rivisto; non c'è escalation automatica a un modello più costoso. Il benchmark interrompe ulteriori richieste allo stesso provider dopo un errore di autenticazione o quota, evitando tentativi ripetuti senza misure utili.
5. Rivedere modifiche semantiche, sostituzioni puntuali del sorgente, continuità delle identità e domande. **Apply Sync** pubblica la coppia modello/codice soltanto dopo i controlli. La posizione dei nodi, le annotazioni e il codice fuori dalle sostituzioni sono conservati.
6. **Undo Last Sync** ripristina modello e sorgenti della propria operazione se non sono stati modificati successivamente. **Recover Sync** gestisce operazioni interrotte; il ripristino storico del solo modello resta disponibile separatamente.

Gli stati visualizzati sono allineato, in attesa, in riconciliazione, in conflitto e verifica fallita. Allineamento del modello e delle evidenze non equivale a superamento dei test runtime: Sync non esegue comandi o test restituiti dal provider.

## Contesto e output per modelli economici

Il protocollo in `ade/ai/reconciliation.ts` invia differenze a tre versioni e contesto d'impatto, invece dell'intero progetto. Le identità sono sostituite da handle compatti e ripristinate localmente; le evidenze deterministiche includono dichiarazioni, firme, riferimenti e lacune di copertura. Per ogni file selezionato sono mostrate finestre del codice comune e corrente; le finestre privilegiano il cambiamento e le dichiarazioni coinvolte. Righe, file e baseline omessi restano sconosciuti: il modello deve chiedere chiarimenti o altro contesto.

Ogni finestra per versione/file usa al massimo 8.000 caratteri, con riduzione ulteriore in base al budget. Prompt e schema sono misurati in byte prima dell'invio e devono rientrare nel limite configurato. La stima token è una stima esplicita, separata da token e costi restituiti dal provider. Non vengono inviati percorsi assoluti, interi repository, credenziali o file esclusi dalla selezione. La selezione è comunque da rivedere: il filtro dei percorsi non è uno scanner dei segreti nel testo.

L'output rigoroso contiene riepilogo, domande, modifiche puntuali a elementi/relazioni, ancore testuali univoche con sostituzione e binding delle identità. Non contiene comandi shell, patch arbitrarie o un documento completo rigenerato. Ruoli semantici e nomi leggibili del diagramma sono scelti dall’IA e possono differire da tipo sintattico e identificatore del codice: per esempio il controller «Conferma acquisto» può essere collegato alla funzione `confirm_purchase` senza diventare una semplice copia dell’albero sintattico. Le ancore devono appartenere alle finestre condivise, essere univoche e non sovrapporsi nella versione originale del file. I riferimenti del modello devono restare validi. Le modifiche del codice vengono rilette dagli adattatori disponibili, senza inventare risultati dei test.

Il benchmark dedicato **Compare Reconciliation Models** confronta due modelli su Python, Java e Go: nove casi per modello, con trasformazione in entrambe le direzioni e conflitti concorrenti. Gli oracoli controllano codice personalizzato, identità e risultati attesi senza fidarsi del riepilogo del provider. Il report registra byte del prompt/output, token disponibili, latenza ed errori. La soglia del corpus è 9/9; una prova simulata non seleziona mai un default reale. Un suggerimento economico richiede prove live riuscite, consumi disponibili e tariffe documentate con unità confrontabili. Il modello salvato dall'utente viene rispettato; il risultato del benchmark di riconciliazione non certifica il percorso di implementazione M5.

Il runner è disponibile anche da Node:

```sh
node ade/ai/reconciliation-benchmark.mjs CANDIDATES.json NEW_REPORT.json
```

Il file dei candidati contiene da due a tre oggetti `{ "config": ... , "rates": ... }`, con lo stesso contratto CLI di M5. `rates`, se disponibile, dichiara `input`, `output`, `unit`, `source` e `asOf`; i consumi stimati non sono presentati come addebiti reali. Il runner non modifica la configurazione del provider o il modello salvato.

## Linguaggi, copertura e verifiche

Il motore e il protocollo IA accettano testo in qualsiasi linguaggio. I 16 profili strutturali M4 restano gli aiuti deterministici disponibili: JavaScript, TypeScript, TSX, Python, Java, C#, C, C++, Go, Rust, PHP, Ruby, Swift, Dart, Kotlin e Scala. Il compilatore JS/TS e gli indici SCIP aggiungono riferimenti dove disponibili, senza diventare il motore delle trasformazioni.

Per linguaggi senza parser, come SQL nel test di integrazione, il provider può proporre elementi e collegarli a un nome testuale univoco con `syntaxKind: "ai"`. La mappatura è marcata `ai:` e non viene inserita nell'indice deterministico: esprime interpretazione IA con evidenza testuale, non risoluzione del compilatore. Anche in questo percorso valgono ancore esatte, revisione, hash, undo e recupero. La copertura di verifica è esplicita, non universale.

Questo incremento applica modifiche a file di testo esistenti, incluse aggiunta/rimozione di dichiarazioni e cambiamenti comportamentali rappresentabili con sostituzioni puntuali. Creazione di nuovi file, spostamenti/cancellazioni fisiche di file e workflow con compilazioni/test specifici del framework continuano nel percorso recuperabile M5 o negli strumenti del progetto. Se la trasformazione richiede queste operazioni, l'IA deve formulare una domanda e il Sync resta irrisolto. Gli indici SCIP esterni non sono ricostruiti dal modello: una trasformazione che li invalida richiede nuovi indici; in loro assenza l'applicazione viene annullata. Le prove automatiche con provider simulato non certificano la qualità di un account/modello reale né il comportamento runtime di tutti i linguaggi.

## Revisioni, registro e recupero

Ogni nuovo snapshot conserva separatamente proiezione deterministica, documento modificabile, `common-model.json` e `common-code.json`. I preimage di codice sono UTF-8, escludono file nascosti/sensibili e binari, hanno un limite di 256 KiB per file e 8 MiB complessivi; ciò che non viene conservato resta sconosciuto nel confronto. Il marker sigilla i baseline con hash; gli snapshot M4 precedenti restano leggibili, con baseline semantico generato e codice comune non disponibile.

I file `.ade/reconciliation/<id>.json` registrano origine, revisioni, provider/modello, hash del prompt/output approvati, dimensioni e preimage/postimage dei sorgenti. Il registro precede ogni scrittura. Puntatore attivo e riferimento comune cambiano soltanto quando modello, indice, codice e revisione osservata sono coerenti. La riconciliazione condivide il lock di progetto con applicazione e undo M5.

Modifiche successive al documento, al puntatore, al manifest, ai file condivisi o ai permessi invalidano la revisione. Undo e recupero riconoscono esclusivamente immagini note: una modifica manuale imprevista viene conservata e blocca il ripristino automatico. Un'interruzione prima della pubblicazione ripristina gli esatti preimage; dopo la pubblicazione completa il registro della versione pubblicata. Il layout e la sola serializzazione del documento non generano riscritture del sorgente; una successiva analisi della coppia applicata risulta allineata.
