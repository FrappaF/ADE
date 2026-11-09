<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# ADR 0006 · Predicati portabili v1

Stato: adottato per DAI-04/S05 iniziale, 9 novembre 2026. Attua la parte iniziale di D02; le politiche complete dei frame restano DAI-06.

Usiamo grafi AST JSON versionati con nodi locali ordinati per definizione prima dell'uso, massimo 128 nodi. Supportiamo riferimenti a parametri e campi di record tramite ID, letterali scalari con tipo nominale, confronti, logica booleana, presenza e null. Le precondizioni vedono solo input; le postcondizioni anche output. Nessuna variabile ambientale, call, shell o `eval`. Gli effetti rimangono nelle operazioni, separati dalle guardie pure.

I numeri v1 sono interi JavaScript sicuri, inclusi ±9007199254740991; nessuna conversione implicita. Denaro e quantità conservano tipi nominali distinti anche quando entrambi interi. I confronti ordinati richiedono lo stesso tipo intero; uguaglianza scalare esatta per stringhe/booleani, senza locale o normalizzazione Unicode implicita. Decimali, aritmetica, collezioni e tempo/fuso non sono supportati in v1 e richiedono un incremento dichiarato.

Presenza e nullabilità sono indipendenti. Valore assente e confronto ordinato con null producono risultato indeterminato, rappresentato da `null` nel risultato del predicato. `present` e `isNull` sono espliciti. La logica usa tre valori: falso AND indeterminato è falso; vero OR indeterminato è vero; NOT indeterminato è indeterminato. La scelta di un ramo non può convertire implicitamente indeterminato in vero/falso. Il type checker valida tutti i nodi prima dell'interpretazione; il valutatore puro non promette valutazione lazy di input malformati.

La resa leggibile deriva dall'AST e dai nomi dei campi; non è un secondo contratto. Il vecchio testo libero resta descrittivo. Il generatore ESM usa esclusivamente template fidati e dati JSON, senza incorporare sorgenti da etichette. I casi limite sono verificati contro attesi indipendenti nell'interprete e in un modulo emesso caricato dal runner Node.

Le sequenze complete adotteranno `critical` come forma canonica, `region` come alias; prima di supportare `alt` e `par` occorreranno politiche esplicite di scelta/join. Questa decisione non abilita ancora quei frame né certifica stati o codice applicativo.
