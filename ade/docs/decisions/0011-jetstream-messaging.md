<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# ADR 0011 · Messaggi con NATS JetStream

Stato: adottato per DAI-08, 9 novembre 2026 (Europe/Rome). Completa D04 sul primo broker; secondo stack aperto.

Node 24.22.1 ESM, nats-server 2.11.9 e client `nats` 2.29.3 sono le versioni dichiarate. Il profilo Node passa a revisione 5. Il client è confinato nel pacchetto `ade/messaging`; il runner di progetto continua a eseguire soltanto emettitori e dati autorizzati, senza connessioni al broker. Le integrazioni avviano un server isolato su loopback, namespace esclusivo e store temporaneo. Nessuna credenziale o endpoint reale nel modello: solo riferimenti; questo adapter locale supporta esplicitamente `credentialRef: none`.

Ogni canale logico ha uno stream file a retention limits e soggetto esatto, con capacità e finestra di deduplica finite dichiarate. Queue: una subscription durevole, condivisa dai worker. Topic: subscription durevoli distinte, ciascuna riceve ogni messaggio. Il broker è un container messaging separato; canali e subscription sono risorse, con owner espliciti. Contratti nominali record, envelope v1, versione del messaggio e compatibilità exact. Routing e correlazione sono campi obbligatori dichiarati, verificati nel payload; nessun routing wildcard inferito.

Ack esplicito, consegna almeno una volta, timeout di ack dichiarato. `max_ack_pending=1` mantiene l'ordine seriale nella subscription; nessun ordine globale. Nack differito usa il backoff dichiarato. Il limite dei tentativi degli effetti è applicato dall'adapter, mentre il broker ha max_deliver illimitato: dopo crash sull'ultima consegna deve ancora essere possibile scrivere la DLQ. La DLQ è un secondo stream file; si attende PubAck prima di ackare l'originale. Riconsegne nel gap possono duplicare la DLQ oltre la finestra di deduplica. Capacità esaurita rifiuta nuovi publish anziché eliminare messaggi non completati.

Idempotenza: scelta esplicita `none` oppure `file-ledger-v1`. Il ledger locale, con singolo writer per subscription, registra hash del payload e completamento con replace atomico e fsync prima dell'ack. Due worker che usano il ledger condividono la stessa autorità serializzata; il runtime rifiuta un secondo writer. Un effetto riuscito prima di salvare il completamento può ripetersi: nessuna transazione con servizi o DB, nessuna outbox, nessuna garanzia exactly-once. La deduplica del producer è solo quella del broker nella finestra dichiarata, non una verifica universale di identità/payload.

Provisioning crea risorse solo nel namespace esplicito; attach dopo riavvio verifica la configurazione anziché aggiornarla. Il journal pubblica modello, configurazione ESM e test, non risorse o stato vivo del broker. Reverse ammette solo piani riconosciuti e re-emissione completa; altre modifiche sono mapping parziale. Le prove reali devono restare separate dalla simulazione deterministica.
