<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# ADR 0013 · Percorso nativo e preparazione continua con review manuale

Stato: accettato per DAI-10, 9 novembre 2026 (Europe/Rome).

## Contesto

Il primo profilo dispone di editor, runner e journal, ma task/chiarimenti strutturali non erano persistiti nel modello e la normale review mostrava JSON. La preparazione continua deve rispettare revisioni, consumi e operazioni native senza pubblicare risultati superati.

## Decisione

Aggiungere intenti opzionali versionati a v4 e un comando semantico atomico con storia e revisione attesa. Riutilizzare documento, QuickInput, proiezioni accessibili e stack nativo. Mostrare review ed esiti nel diagramma; riservare pacchetti e diff all'anteprima tecnica.

Implementare una sola coda seriale di preparazione, spenta di default, con opt-in per root, budget da 1 a 100 tentativi salvato prima dell'esecuzione, coalescing di 600 ms, cancellazione e controllo indipendente della freschezza. Riprendere un budget non lo ricarica. Un nuovo budget è una scelta esplicita. Dopo riavvio non avviare lavoro automaticamente.

Usare il protocollo strutturale e i limiti esistenti di 192 KiB/64 KiB, con limite input anche nel worker prima del worktree. Il profilo deterministico non chiama provider. La politica v1 ammette solo review, verifiche e pubblicazione manuali; il worker continua a controllare inventario, preimmagini e journal. Nessuna migrazione di dati vivi.

## Conseguenze

Il percorso ordinario non richiede editing JSON. Storia, chiarimenti e disponibilità delle azioni seguono la revisione del documento; gli esiti obsoleti vengono scartati anche se un adapter ignora la cancellazione. Cancellazioni/fallimenti consumano il tentativo riservato e non generano retry incontrollati. Un worktree preparato prima di una cancellazione tardiva resta recuperabile con il protocollo esistente; non viene pubblicato.

Le prove native usano servizi e dialoghi scriptati; Chromium verifica renderer, tastiera, temi e viewport con CSS reale. Non certificano il desktop completo. Secondo archetipo e release restano DAI-11/12, R01–R16 aperti. Perimetro e riproduzione: [workflow v1](../diagram-driven-ai/workflow-v1.md).
