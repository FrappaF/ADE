<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# DAI-05 · Attesi indipendenti

Registrati il 9 novembre 2026 prima dell'adapter. Il primo progetto eseguibile è una feature pura di validazione quantità, con contratto di precondizione booleano/indeterminato e input a identità stabile. Non si deduce un'implementazione arbitraria dell'operazione dalla prosa.

| ID | Atteso bloccante |
|---|---|
| P01 | Da cartella senza codice/import: repository, manifest e sorgente ESM del predicato; piano completo prima delle scritture pubblicate. |
| P02 | Quantità -1/0 → false, 1/MAX_SAFE_INTEGER → true, assente → indeterminato, null/stringa/intero non sicuro → errore di tipo. Oracoli dati indipendenti, revisionati separatamente dal generatore. |
| P03 | Modifica visuale gt→ge: modello immediato, target da aggiornare, diff minimo, nessuna inferenza deterministica. Layout/no-op: zero chiamate e nessuna proposta. |
| P04 | Oracolo che richiede false per zero rifiuta ge anche se i test derivati dal nuovo modello passano. Nessuna pubblicazione prima della review e dei controlli. |
| P05 | Revisione del modello, sorgenti, criteri, profilo o baseline successiva alla review blocca applicazione. Proposte con domanda essenziale non diventano codice. |
| P06 | Reverse di confronto/literal nel template verificabile conserva identità, layout, annotazioni e codice fuori regione. Corpo arbitrario produce mapping parziale; cambiamento concorrente della stessa regola produce conflitto. |
| P07 | Creazione, spostamento/rinomina e cancellazione mantengono pre/postimmagini e permessi; undo ripristina coppia e baseline, rifiutando modifiche manuali. |
| P08 | Arresti prima/durante/dopo pubblicazione: recovery completa la coppia pubblicata oppure ripristina la precedente. Nuove pubblicazioni bloccate durante recovery; nessuna scrittura su dati sconosciuti. |
| P09 | Runner a comandi fidati, env senza credenziali, Node permission e sola regione riemessa dal dominio. Test/codice arbitrari del progetto non eseguiti; limiti OS/rete espliciti. |
| P10 | Dipendenze/servizi/storage non supportati bloccati. Migrazione DB produce solo artefatto revisionabile con precondizioni/dati/recupero, nessuna esecuzione/deploy. |
| P11 | Workbench: creazione feature da progetto vuoto, criteri, preparazione, review diff, verifiche reali, pubblicazione, reverse, ripresa e undo via comandi nativi. |
| P12 | CLI usa gli stessi contratti; report separa prove reali, risposte registrate e inferenze live. Legacy v2/v3 e guard v4 invariati. |
