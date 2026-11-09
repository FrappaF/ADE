<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# ADR 0012 · Round trip delimitato e indice ricostruibile

Data: 9 novembre 2026 (Europe/Rome). Stato: adottata per DAI-09, Node ESM revisione 5.

Il round trip deve distinguere una modifica eseguibile supportata dall'interpretazione di intenzioni non presenti nel codice. Rename e move non cambiano le identità, ma invalidano lookup e prove fisiche. Una cache persa non deve impedire il recupero né diventare una nuova baseline.

Adottiamo la [matrice per costrutto](../diagram-driven-ai/roundtrip-v1.md): reverse limitato alla grammatica dell'adapter, riemissione esatta delle regioni, conservazione dei dettagli senza proiezione, conflitto o mapping parziale per il resto. ADR e PSM sono autorevoli nel modello. Non vengono ricostruiti da naming, commenti o risposte IA.

Il parser TypeScript 6.0.2 di produzione è condiviso tra import e indice strutturale. La cache dell'indice si ricostruisce da file fisici con hash e permessi, distinguendo fatti sintattici da claim di mapping. Non viene consultata per fidarsi delle identità precedenti. Ogni nuova review sigilla l'inventario; una modifica invalida la verifica. L'indice non è incluso nel journal delle immagini perché è derivato e ricostruibile; lo snapshot comune rimane incluso nel protocollo di commit esistente. Snapshot autorevole perso significa blocco esplicito.

Estendiamo percorsi a sottocartelle limitate, controllando collisioni anche dei test generati e conservando i mode nel move. Publish, undo e recovery restano sul lock/journal comune. Nessun nuovo servizio di sincronizzazione, migrazione runtime o protocollo di pubblicazione. I controlli conservativi possono richiedere review separate per cambi indipendenti della foundation. I limiti della scansione possono bloccare progetti grandi; non si allargano i budget frozen e non si tronca l'evidenza.
