# Collaudo della generazione dei diagrammi su Express

La generazione e la pubblicazione finale sono completate su una codebase reale con l’account Codex autenticato dall’utente. Sono stati corretti i blocchi riprodotti durante il percorso, conservando gli step completati. I sorgenti del progetto sono invariati.

## Campione e metodo

- Branch ADE: `feat/m6-dai-validation`, aggiornata con pull al commit `b82c4727c4812ce1a8b240a38b731996805d68b5`. Le correzioni sono locali.
- Progetto: Express v5.1.0, commit `cd7d4397c398a3f3ecadeaf9ef6ac1377bd414c4`; repository completo, con esempi, test e benchmark, senza restringere lo scope per evitare i problemi.
- 226 file importati; 142 file JavaScript, 21.164 righe JavaScript, 126 dichiarazioni; 513 unità di evidenza e 231 ancore indicizzate. Importazione e preparazione iniziale: circa 13,7 secondi, mentre erano in corso anche test locali.
- CLI originale `codex 0.163.0`, modello `gpt-5.6-terra`, login ChatGPT completato dall’utente. Lo stato di login iniziale era positivo ma una richiesta effettiva restituiva 401; il nuovo login ha risolto l’accesso.
- Protocollo di produzione `createCodeEngine`: importazione, preparazione, step, approvazione del piano e pubblicazione atomica. Budget di contesto 262.144 byte, timeout per chiamata 180 secondi.
- 21 chiamate reali. Due risposte reali già registrate sono state rivalidate dopo correzioni deterministiche: evidenze complete, grafo, istruzioni e schema erano identici; differiva soltanto il feedback dell’errore precedente. Non sono state sostituite da risposte simulate.
- Consumi riportati dalla CLI: 583481 token di input e 36536 di output. La CLI non fornisce un addebito effettivo verificabile.

## Problemi riprodotti e correzioni

1. **Conflitti tra relazioni di gruppi diversi.** I gruppi successivi ricevevano soltanto le chiavi precedenti e potevano attribuire loro estremi diversi. Ora ricevono responsabilità, ruoli ed estremi, deduplicati e limitati in dimensione. Una connessione incompatibile continua a essere rifiutata e l’errore identifica la chiave.
2. **Checkpoint non più leggibile dopo un gruppo composto solo da test.** ADE creava un’overview con zero nodi, la salvava e poi la rifiutava come `Inconsistent diagram checkpoint`. Ora salva la copertura senza vista vuota e recupera soltanto questa forma storica, validando tutti gli altri campi. Il checkpoint reale con cinque gruppi già completati è stato recuperato.
3. **Falso errore sulle dipendenze.** Una sorgente assegnata a una feature veniva trattata come un partecipante operativo. Inoltre, la sintesi globale non riceveva le dipendenze che il controllo finale le chiedeva di rappresentare. Ora la distinzione tra raggruppamenti ed elementi operativi è rispettata e il catalogo globale divulga le dipendenze pertinenti. Una vera interazione mancante continua a essere rifiutata.
4. **Oggetti esistenti dichiarati come sconosciuti nel piano.** Il catalogo eliminava responsabilità richiamate esplicitamente dal piano quando la copertura finale raggruppava altrove le loro evidenze. Ora il focus e il proprietario di ciascuna vista conservano soltanto identità già dichiarate; i riferimenti inesistenti continuano a essere rifiutati.
5. **Feature eliminate durante la pubblicazione finale.** Le feature proprietarie delle viste o destinatarie della copertura venivano eliminate se non erano anche antenati dei nodi. Ora vengono conservate insieme ai relativi riferimenti, evitando `An aggregated source unit refers to a missing responsibility`.

È stata inoltre migliorata la diagnosi delle relazioni con ruoli incompatibili. Nel test reale una scrittura da una risorsa a Redis è stata correttamente rifiutata; il messaggio ora indica la relazione e i ruoli, invece di un solo indice interno.

## Risultato

Il lavoro è terminato con 18 step su 18, quattro viste pubblicate, 23 elementi semantici (incluse le feature) e 23 relazioni condivise. Le riprese hanno conservato le analisi e le viste già completate.

| Vista | Tipo | Nodi | Collegamenti |
| --- | --- | ---: | ---: |
| Express Framework Overview | structure | 11 | 9 |
| HTTP Request Processing | sequence | 6 | 5 |
| Middleware and Body Processing | activity | 8 | 10 |
| Response and Configuration Responsibilities | structure | 8 | 6 |

Il modello ha posto una domanda reale sul ramo di gestione degli errori, scollegato dal flusso dell’attività. Il collaudo ha ristretto quella vista al flusso supportato dal grafo, senza inventare collegamenti, e ha ripreso gli ultimi due diagrammi conservando i primi due.

## Verifiche

- 176 test ADE di importazione, 112 di collaborazione AI e 43 di geometria/comportamento dei diagrammi: **331 superati, zero falliti**.
- Sette regressioni aggiunte, comprese ripresa dopo riavvio, recupero ristretto dei checkpoint storici, rifiuto di campi imprevisti, dipendenze effettive del compilatore TypeScript, riferimenti del piano e conservazione delle feature.
- Controlli TypeScript dei pacchetti AI e code-import superati; `git diff --check` superato.
- Tutte le quattro viste finali aperte in Chromium con il metodo di produzione `renderCanvas`, i suoi helper e il CSS del prodotto. Verificati nodi, presenza e visibilità dei collegamenti, geometria senza NaN, attivazione da tastiera e assenza di errori JavaScript; screenshot ispezionati.
- Hash dei sorgenti confrontati prima/dopo ogni tentativo e repository Express senza modifiche ai file versionati; unica aggiunta `.ade`.

## Perimetro e riproduzione

Il collaudo comprende il motore nativo e il canvas con servizi del workbench isolati. Non comprende l’avvio completo della shell Electron. La correttezza semantica resta oggetto di revisione: per esempio, l’overview conserva Application Settings senza un collegamento esplicito disegnato.

Per ripetere il caso, clonare Express al tag e commit indicati, importare la cartella completa con scope predefinito e analisi del compilatore, scegliere lo stesso modello nella CLI autenticata e chiedere di spiegare il framework HTTP, considerando test, esempi e benchmark come evidenze di supporto. Approvare il piano e rispondere alle eventuali domande attraverso la ripresa. Le operazioni e i parametri esatti sono registrati negli artifact locali.

Comandi dei controlli locali:

```sh
npm --prefix ade/code-import test
npm --prefix ade/ai test
node --test ade/test/diagram-*.test.mjs ade/test/sequence-diagram.test.mjs ade/test/state-diagram.test.mjs
npm --prefix ade/ai run check
npm --prefix ade/code-import run check
git diff --check
```

Artifact locali della sessione: `.build/diagram-validation/summary.json`, cartelle `express-live` e `express-resume*` con prompt/schema/risposte reali, `empty-overview-checkpoint.json`, log dei test, `browser-results.json` e screenshot `diagram-0.png` … `diagram-3.png`. Il modello finale si trova in `/workspace/express-diagram-validation/.ade/imports/140a8435-2357-4795-b9da-df0f0fba761f/model.ade.json`.
