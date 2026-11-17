# Feedback degli errori

Gli errori di un’azione utente vengono spiegati nel contesto corrente, senza aprire un editor o una pagina dedicata. Il componente condiviso `adeErrorNotice.ts` presenta un titolo, **Causa** e **Come risolvere**; i dettagli originali sono espandibili. Le notifiche native usano lo stesso catalogo localizzato (`adeErrors.ts`) con le stesse informazioni. Il componente non sposta il focus e usa testo semplice anche per dati importati o restituiti dai servizi.

## Flussi verificati

| Flusso | Errori gestiti | Recupero proposto |
| --- | --- | --- |
| Diagrammi, elementi e relazioni | Tipi incompatibili, estremi mancanti, riferimenti eliminati, duplicati, cicli e proprietari non validi | Scegliere elementi compatibili, ripristinare i riferimenti o correggere proprietà e appartenenza |
| Stati e sequenze | Risorsa estranea al ciclo di vita, transizione o messaggio incompatibile, diagramma derivato | Usare il ciclo di vita corretto o modificare l’interazione/scenario collegato |
| Blueprint e specifiche | Scope C4, contratti, tipi, criteri, errori dichiarati, conflitti di asserzioni e storia delle decisioni | Aprire l’editor responsabile e correggere il vincolo indicato |
| Form e wizard | Campi obbligatori, valori e combinazioni non validi, eccezioni dei validatori | Correggere i campi mantenendo i valori già inseriti |
| Modifiche concorrenti | Progetto, sorgenti, criteri o contesto cambiati durante un’operazione | Riaprire il form o preparare una nuova review dal contesto attuale |
| Apertura e salvataggio | JSON invalido, versione non supportata, file mancante, permessi, spazio esaurito e conflitti su disco | Correggere/ripristinare il file, controllare l’accesso o salvare una copia |
| Importazione e sincronizzazione | Analisi fallita, snapshot non disponibile, baseline non pronta, engine incompatibile | Controllare sorgenti e contesto, ripetere Sync o aggiornare l’applicazione |
| IA, account e generazione | CLI non disponibile, autenticazione, rete, budget, generazione e review fallite | Correggere la configurazione indicata e riprendere o preparare la richiesta |
| Errore non riconosciuto | La causa non è determinabile dai dati ricevuti | Riprovare e conservare i dettagli per una segnalazione; nessuna causa viene inventata |

Gli annullamenti volontari mantengono il comportamento dei flussi esistenti e non vengono trasformati in errori.

## Integrità dell’editing

L’editing visuale verifica l’intera modifica prima di scrivere nel documento. Un nuovo errore strutturale bloccante viene rifiutato: diagramma, selezione, testo e cronologia undo restano invariati. Una modifica composta viene valutata sul risultato finale. Le correzioni a bozze già invalide sono consentite, purché non introducano nuovi problemi; il confronto usa identità stabili e considera la molteplicità delle diagnostiche.

Un’interfaccia richiesta senza collegamento al provider rimane una bozza supportata dal flusso di progettazione: diagrammi e proprietà restano disponibili, mentre l’avviso indica come aggiungere il collegamento. La generazione del codice continua a richiedere la correzione delle diagnostiche strutturali. Un modello aperto da disco che non può essere rappresentato in sicurezza mostra il componente di recupero nell’editor corrente.

## Verifiche

I test coprono il catalogo delle diagnostiche, il fallback, i dettagli trattati come testo, focus e notifiche accessibili, conservazione dei form dopo errori, azioni sincrone/asincrone, integrità delle modifiche v4/v5, correzione e undo delle bozze, cause originali di lettura/salvataggio e feedback dei servizi IA/codice.
