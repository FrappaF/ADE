<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# DAI-10 · Percorso visuale/accessibile e continuità

Consegna del 9 novembre 2026 (Europe/Rome), branch `work`, HEAD `05c3a0f0`. DAI-01–10 restano modifiche locali senza commit/push/PR. Prossimo: [DAI-11](handoff-dai-11.md).

S14 è consegnato nel primo profilo dichiarato, con [matrice e percorso](workflow-v1.md), [attesi indipendenti](dai-10-acceptance.md) e [ADR 0013](../decisions/0013-native-workflow-and-continuous-preparation.md). Le proprietà espongono maturità derivata, owner, ignoti/provenienza, contratti e vincoli; gli ingressi dipendono dal tipo selezionato e le diagnostiche aprono l'editor responsabile. La lettura accessibile include intento e storia degli ADR. Gli editor esistenti mantengono frame/espressioni/stati/messaggi gestibili da tastiera.

Task e chiarimenti sono versionati nel documento v4 con storia completa e revisione attesa; salvataggio, undo/redo e riapertura sono provati. Il contesto sigillato e il worker usano l'intento corrente del target. La review ordinaria vive nel diagramma con piano, copertura, conflitti/errori, verifiche reali e ritorno alla selezione; pacchetto e diff sono un approfondimento tecnico. Una review superata blocca anche le chiamate dirette di verifica/pubblicazione.

La preparazione continua S12 è opt-in per progetto, con budget preventivo di 1–100 tentativi, salvataggio esplicito nella politica, coalescing, cancellazione e scarto dei risultati obsoleti. Stop/ripresa conserva il consumo; dopo riavvio non parte lavoro. Fallimenti non causano retry automatici. Il profilo deterministico opera senza provider: zero chiamate IA, review e pubblicazione manuali, 192 KiB/64 KiB e overflow bloccante. Lock e journal restano condivisi, nessuna migrazione di dati vivi.

**719 test distinti passati**: 271 dominio, 107 IA/progetto, 169 importazione, 154 nativi e 18 Chromium. Il totale unisce la suite dominio da 270 con il riesame finale da 14 casi (13 sovrapposti e uno nuovo); i riesami non vengono ricontati. Le prove native guidano i dialoghi/servizi di produzione con dipendenze scriptate. Chromium prova i renderer e sei combinazioni tema/viewport (chiaro/scuro/alto contrasto, 320/1000 px), Tab/Invio, controlli disabilitati, focus, etichette e testo ostile. Non è il desktop completo.

Il [bundle nativo di produzione](../benchmarks/dai-10-project-2026-11-09.json), con una sola copia TypeScript, attraversa coda e protocollo reali: due revisioni coalescono in una preparazione, un tentativo riservato, zero pubblicazioni automatiche; poi verifiche reali, move annidato, reverse, no-op e undo. Il pacchetto sigillato misura **51.629 byte**, con chiarimento incluso; p95 compilazione del contesto **13,85 ms** nel riesame finale, entro 500 ms. I 17 casi derivati più 17 indipendenti interni al runner non incrementano il totale dei test distinti.

La [baseline frozen](../benchmarks/dai-10-2026-11-09.json) misura RSS massimo **144,70 MiB**; il grande pack evidence-only resta **284.875 byte**, oltre 192 KiB, con risultato negativo conservato e senza troncatura. I tre pacchetti e 20 sorgenti workbench selezionati passano il typecheck; i tre runtime generati sono aggiornati. v2/v3 e corpus/budget frozen restano invariati.

[Report di verifica](../benchmarks/dai-10-verification-2026-11-09.json): risultati, hash, harness, limiti e riproduzione. Le prove di recovery iniettano gli stati persistiti: non sono certificazione di perdita di alimentazione. Il broker reale, invariato in questo sprint, non è stato rieseguito; restano le prove isolate DAI-08. Secondo archetipo, desktop completo e accettazione finale restano DAI-11/12. R01–R16 aperti.
