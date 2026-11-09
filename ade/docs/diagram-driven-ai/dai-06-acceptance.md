<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# DAI-06 · Attesi indipendenti prima dell'emettitore

9 novembre 2026. Gli attesi sono dati scritti prima del runtime e non derivano dall'interprete o dal generatore. Il corpus v1 rimane congelato.

| Caso | Osservazione obbligatoria |
|---|---|
| E01 | Quantità + quantità conserva il tipo nominale; quantità + denaro è respinto. Divisione non intera, zero e overflow falliscono esplicitamente. |
| E02 | Assenza diversa da null; collezione vuota: every=true, any=false, count=0. Elemento con tipo errato respinto. |
| I01 | Checkout approved: charge, persist. declined, pending e unknown: charge, handleOther; else non è sinonimo di declined. |
| I02 | Due chiamate charge hanno ID e risultati distinti, stessa operazione. Ordine osservabile charge, charge, persist. |
| I03 | Loop con alt annidato: limite esplicito, contatore locale; due chiamate e terminazione. Guardia ancora vera al limite produce loopLimit. |
| I04 | opt false non chiama notify; true la chiama una volta. |
| I05 | ref passa parametri tipizzati e revisione; firma o revisione incompatibili bloccano prima dell'esecuzione. |
| I06 | par all avvia entrambi i rami; errore cancella cooperativamente gli altri e attende il drain. Risultati in ordine dichiarato, nessun risultato di ramo fuori scope. |
| I07 | Due rami con effetto condiviso senza critical sono respinti; con stessa risorsa critical non si sovrappongono. |
| I08 | Risposta oltre timeout dà timeout, nessun persist; errore dichiarato conserva codice e occorrenza. Nessun retry implicito. |
| I09 | Variabile fuori ramo, guardie simultaneamente vere/indeterminate, ciclo ref e frame ricorsivo sono respinti o falliscono esplicitamente. |
| P01 | Stesso journal DAI-05: review, test indipendenti, publish, undo; input modificato o test fallito impedisce publish. |
| P02 | Reverse riconosce soltanto piano dati con corpo emesso identico; corpo arbitrario produce mapping parziale. Concorrenza e modifiche fuori regione conservate. |
| C01 | Layout equivalente: stesso contesto; ref include contratto/revisione e omette corpo indipendente, delta enum include consumer. Overflow blocca senza troncare. |
| U01 | Editor gerarchico e lettura accessibile espongono frame, ordine, guardie e policy senza richiedere sorgenti; cancellare non modifica il modello. |

Il runner esegue esclusivamente codice emesso dal prodotto e risposte dichiarate come dati. Chiamate di rete, broker, DB, comandi e codice del progetto non entrano nel runner; Node permission non viene presentata come sandbox OS.
