<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# DAI-08 · Attesi indipendenti

Fissati prima dell'adapter, 9 novembre 2026 (Europe/Rome). Le prove del modello e quelle JetStream sono distinte.

| Caso | Atteso |
| --- | --- |
| V01 | Policy assenti, versioni/schema incompatibili, owner o producer non dichiarato bloccano il target; nessun default inferito |
| Q01 | Due worker della stessa queue condividono una subscription: ogni messaggio completato raggiunge un solo worker; due subscription sul topic ricevono entrambe il messaggio |
| D01 | Lo stesso ID entro la finestra broker è deduplicato; la stessa identità con payload differente è conflitto nel ledger consumer, mai nuovo effetto |
| R01 | Crash prima dell'ack: riconsegna dopo ackWait; restart del broker con store file conserva messaggi e consumer |
| R02 | Fallimento: nack con backoff esplicito; ultimo tentativo pubblica DLQ e attende PubAck prima dell'ack originale; crash nel gap può ripetere DLQ, deduplicata nella finestra dichiarata |
| R03 | Crash sull'ultimo tentativo non causa perdita silenziosa: max_deliver broker illimitato, limite degli effetti applicato dall'adapter e consegne oltre limite instradate in DLQ |
| O01 | Ordinamento seriale per subscription con max_ack_pending=1 e un messaggio in volo; nessun ordinamento globale tra subscription |
| I01 | Ledger file completato prima dell'ack evita ri-esecuzione nel gap completion/ack; crash prima del completamento può ripetere l'effetto. Nessuna transazione effetto/ledger, outbox o exactly-once |
| C01 | Envelope alterato/incompatibile da client raw va direttamente in DLQ; publisher API rifiuta prima della pubblicazione; un timeout senza producer non inventa eventi |
| P01 | Artefatti generati, reverse supportato, review superata, publish/undo/recovery usano il journal comune; il runner di progetto non avvia broker né cambia dati vivi |
| U01 | Editing nativo con annullamento, policy obbligatorie, lettura accessibile e dettaglio da L2; simulazione indicata esplicitamente come tale |
