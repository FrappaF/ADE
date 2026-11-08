# Revisione UX del flusso IA — 6 novembre 2026

Il percorso principale è **importare → generare i diagrammi → modificarli → aggiornare il codice**, oppure **aprire Codex → cambiare il codice → tornare ai diagrammi → aggiornarli**. La revisione riguarda le scelte e il feedback richiesti all’utente durante questi percorsi.

| Problema osservato | Comportamento introdotto |
| --- | --- |
| La prima generazione passava da provider, menu di configurazione, modello di coding, eseguibile, budget delle feature e modello dei diagrammi. | Con Codex installato si sceglie il modello dei diagrammi e si rivede l’invio. Il percorso eseguibile appare solo se Codex non viene trovato. La configurazione avanzata rimane disponibile. |
| Ogni clic su Chat with Codex apriva una nuova conversazione. | Il pulsante riapre la conversazione del progetto nella sessione corrente. Il terminale viene riutilizzato finché resta aperto; la chat nativa riusa la stessa risorsa. |
| La chat poteva conservare il modello dello snapshot precedente. | Nella chat nativa l’allegato del vecchio snapshot viene sostituito, gli altri allegati restano presenti e un contesto separato identifica il diagramma attivo. Non viene inviata automaticamente una richiesta al modello. |
| Il passaggio dal terminale al canvas richiedeva conoscere i comandi dell’IDE. | Back to Diagrams richiude il pannello terminale e riporta al modello visuale. La posizione della chat è dichiarata nello stato. |
| Update Code era evidenziato anche dopo modifiche al codice. | Dopo modifiche ai sorgenti viene evidenziato Update Diagrams. Il banner e lo stato indicano lo stesso passo successivo. Ogni generazione continua a richiedere revisione prima dell’inferenza. |
| La rigenerazione riportava alla vista d’insieme. | Diagramma e nodo selezionato vengono conservati se esistono ancora nel nuovo modello. |
| Un job in revisione o in esecuzione mostrava Resume e Start Again. | Revisione, esecuzione e ripresa sono distinte. Durante l’esecuzione compaiono avanzamento e annullamento; Start Again è nelle opzioni secondarie. |
| Errori e notifiche completate si accumulavano sul canvas. | Un errore conserva il progresso e l’azione Resume. Riprendere chiude l’avviso precedente. I completamenti ordinari restano nello stato o nel centro notifiche, senza toast sul diagramma. Una modifica manuale elimina i messaggi di completamento ormai superati. |

## Verifiche

Il [verbale strutturato](validation/ux-ai-workflow-2026-11-06.json) registra 43 test dei servizi nativi, TypeScript, lint mirato, build client e i due smoke desktop superati. Conserva gli hash delle sei schermate ispezionate.

La suite dei servizi nativi copre primo avvio diretto, annullamento della scelta del modello, revisione prima delle richieste IA, riuso delle conversazioni, sostituzione dell’allegato, ritorno dal terminale, progresso persistente dopo un errore e rimozione dei messaggi superati. Queste prove iniettano account, chat e terminale: non sono una conversazione con un provider reale.

Lo smoke Electron `--diagram-workflow` parte con un profilo vuoto e una CLI simulata isolata nel PATH. Non richiede il configuratore M5. Verifica la generazione, l’annullamento prima dell’invio, la modifica sul diagramma e l’aggiornamento del codice. Apre poi il vero terminale integrato, fa cambiare un file alla CLI simulata, riapre la stessa conversazione, torna al canvas e verifica il passo successivo evidenziato. Un errore simulato della generazione deve lasciare Resume disponibile; la ripresa deve conservare diagramma e selezione anche dopo la pubblicazione del nuovo snapshot.

Sono conservate schermate locali di scelta del modello, conferma dell’invio, chat, codice modificato, generazione interrotta e diagramma aggiornato. Lo smoke `--ux-only` verifica tastiera, lettura accessibile, ripristino del focus, finestra stretta, quattro temi e terminale.

## Limiti da validare con l’account reale

Il catalogo nativo richiede i dati dell’account/SDK. Quando non sono disponibili, resta l’inserimento di un ID esatto del modello; il menu `/model` di Codex aiuta a identificarlo. Il modello più economico adeguato non è scelto sulla base delle risposte simulate.

Chat nativa e terminale conservano le proprie interfacce; la conversazione viene riaperta nel percorso già attivo e il ritorno ai diagrammi ha lo stesso comando. Nel terminale, il prompt iniziale indica di risolvere il modello corrente dal puntatore del progetto prima delle modifiche. Il controllo finale su login reale, accesso ai modelli e qualità delle modifiche rimane necessario, insieme alla prova macOS. Il refresh dei diagrammi resta esplicito: i salvataggi del codice non avviano richieste IA a pagamento.
