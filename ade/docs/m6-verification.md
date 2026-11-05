# Verifica M6 — 5 novembre 2026

Branch `feat/m6-reconciliation`, derivata da `main` aggiornato a `75318285`. La [guida alla riconciliazione](reconciliation.md) descrive il perimetro e i limiti. Le trasformazioni sono proposte dall'IA in entrambe le direzioni; il protocollo è indipendente dal linguaggio e impiega gli strumenti deterministici per contesto, controllo e persistenza.

## Verifiche automatiche osservate su Linux

- Suite importazione/Sync: 94 test superati, inclusi i nuovi scenari M6.
- Suite collaborazione IA: 29 test superati, incluso il benchmark multilinguaggio con provider simulato.
- Servizi nativi: 31 test superati, inclusa selezione dei file, revisione del contesto e budget zero della riconciliazione.
- Controlli TypeScript di `ade/code-import`, `ade/ai` e dell'area A.D.E del workbench superati; build client e bundle dell'engine completati; lint mirato dei file del workbench superato.

Il test M6 esegue modello → codice e codice → modello su tutti i 16 profili M4, con continuità dell'identità, conservazione dell'annotazione e posizione del nodo. Un caso con etichetta naturale «Conferma acquisto» e ruolo controller verifica che nome e responsabilità semantici possano differire da nome e tipo sintattici della funzione, con binding IA esplicito. Un caso SQL senza parser verifica interpretazione IA marcata, diagramma e mappatura testuale, oltre a modifiche effettive in entrambe le direzioni e al rilevamento di un successivo aggiornamento del sorgente. Un caso Python comportamentale verifica con un interprete indipendente accettazione/rifiuto degli importi prima e dopo l’undo; la produzione Sync non esegue questi test automaticamente.

Altri casi coprono conflitto comportamentale concorrente, domande senza applicazione, budget zero senza richiesta al provider, output fuori schema, percorsi fuori perimetro, revisione del modello superata, permessi modificati, input compatto, esclusione dei segreti per percorso, undo e recupero dopo riavvio simulato fra scrittura del sorgente e pubblicazione del baseline. La suite M4 conserva i casi di cancellazione, rinomina confermata e recupero; ora include una proposta IA esplicita prima di applicare gli aggiornamenti nativi.

Il benchmark di riconciliazione verifica nove casi per candidato su Python/Java/Go. Il provider simulato corretto supera 9/9; il candidato che modifica anche un confronto del codice personalizzato supera 6/9 e viene escluso dagli oracoli indipendenti. Nessun default reale viene selezionato da questi risultati simulati.

## Verifiche ancora aperte

Lo smoke Electron Linux `--code-only` è stato eseguito con successo con profilo pulito, estensioni integrate disabilitate e CLI simulata. Verifica importazione nativa, aggiornamenti codice → modello (contratto, rinomina e cancellazione), rinomina dal diagramma → codice, revisione del payload e della proposta, undo di modello e codice, navigazione al sorgente, riavvio completo e recupero storico. Il [report nativo](validation/m6-native-2026-11-05.json) registra risultati e hash delle schermate locali. Il collaudo ha individuato e corretto il mancato ritorno al canvas dopo la revisione IA; il test attende il cambio effettivo del workspace prima dei comandi e i riavvii conservano il workspace aperto dall’importazione. Il container usa il layout tastiera di fallback: questa prova non certifica le mappature hardware.

Il [tentativo di benchmark live](validation/m6-live-benchmark-2026-11-05.json) usa Codex originale con `gpt-6-luna` e `gpt-6.1-sol`, ma le richieste sono state respinte dal provider per autenticazione, benché `codex login status` riportasse accesso ChatGPT attivo. Nessuna qualità, latenza di inferenza o consumo dei due modelli è deducibile da questi errori; i token rimangono `null` e non viene selezionato un default. Il runner è stato inoltre aggiornato e collaudato per interrompere le chiamate successive allo stesso provider dopo un errore di autenticazione/quota, distinguendo i casi tentati da quelli non eseguiti. Il report del tentativo conserva gli esiti realmente osservati prima di questa ottimizzazione.

Restano benchmark/provider reale con autenticazione operativa, macOS/VoiceOver e CI remota. Le prove simulate e lo smoke non vengono presentati come qualità misurata di un modello reale.

Sync verifica struttura e revisione con gli strumenti disponibili; non esegue test runtime generati. Il supporto IA per testo arbitrario non certifica che ogni linguaggio disponga di parser, compilatore o suite di esecuzione. Nuovi file, operazioni fisiche sui percorsi e verifiche specifiche del framework restano nel perimetro M5 o negli strumenti del progetto.
