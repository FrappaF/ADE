<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# DAI-09 · Reverse e operazioni fisiche

Consegna del 9 novembre 2026 (Europe/Rome), branch `work`, HEAD `05c3a0f0`. DAI-01–09 restano locali senza commit, push o PR. Il prossimo sprint è [DAI-10](handoff-dai-10.md).

S13 è completato per le proiezioni dichiarate del primo profilo, con [matrice per costrutto](roundtrip-v1.md), [attesi indipendenti](dai-09-acceptance.md) e [ADR 0012](../decisions/0012-structural-roundtrip-and-source-index.md). Contratti, ADR e PSM senza proiezione inversa vengono conservati; modifiche incompatibili restano conflitti o mapping parziali. Non viene ricostruita intenzione arbitraria dal codice.

Il motore ora riconosce move/rename ricorsivi con identità univoca, conserva i permessi e controlla collisioni anche dei test generati. Gli import dei test seguono la nuova posizione. Le fonti mosse entrano nel contesto dalla posizione fisica attuale. Le review sigillano l'inventario e rifiutano nuove copie dopo la verifica. Il parser TypeScript di produzione alimenta un indice ricostruibile, separando fatti sintattici e claim di mapping; uno snapshot autorevole perso invece blocca l'operazione.

Publish, undo e recovery usano il journal condiviso. L'indice viene ricostruito dalle immagini finali; un no-op non riscrive fonti o cache allineata e non chiama provider. Il delete segue modifiche esplicite e valide del modello, preservando il testo personalizzato. Nessuna operazione migra broker, ledger, checkpoint o dati vivi.

**528 test distinti passati**: 257 di dominio, 102 IA/progetto (82 precedenti e 20 nuovi) e 169 di importazione. La suite IA completa da 101 test è stata seguita dal riesame finale dei 20 casi interessati dopo il limite dell’indice; i duplicati non vengono ricontati. I tre pacchetti passano il typecheck e i tre runtime generati sono aggiornati.

Il [bundle di produzione](../benchmarks/dai-09-project-2026-11-09.json) attraversa il protocollo nativo reale con Git, worktree e Node: 17 controlli derivati più 17 attesi indipendenti, move annidato, rename esterno, reverse, no-op e undo. Contiene una sola copia del compilatore TypeScript condiviso. Il pacchetto del reverse è di **51.577 byte**, p95 del compilatore del contesto **19,78 ms**, entro 192 KiB e 500 ms. Questi controlli interni non incrementano il totale dei test distinti.

La [baseline sugli input frozen](../benchmarks/dai-09-2026-11-09.json) misura RSS massimo **145,62 MiB**; il grande pack evidence-only conserva il risultato negativo di **284.875 byte**, oltre 192 KiB, senza troncatura né pretesa di sufficienza strutturale.

La verifica effettiva è registrata nel [report DAI-09](../benchmarks/dai-09-verification-2026-11-09.json). Le prove di arresto sono iniezioni dello stato persistito prima/durante/dopo il commit logico, con riapertura del motore e recovery; non sono certificazione di perdita di alimentazione. Il runner verifica codice emesso e dati indipendenti, escludendo codice personalizzato. Non è stato eseguito il desktop completo. R01–R16 rimangono aperti.
