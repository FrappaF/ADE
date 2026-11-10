<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# Importazione di Spree — 10 novembre 2026

Repository: [spree/spree](https://github.com/spree/spree), commit `af4264fe3af524a79f92e8f5bae318558e997208`. Clone superficiale, Node **24.22.1**, Linux. Non sono state installate dipendenze o eseguiti script del progetto importato. I file tracciati sono rimasti invariati.

## Riproduzione e correzione

Il checkout contiene 10.845 voci tra file e directory, escludendo `.git`. Il limite precedente di 10.000 voci interrompeva l'inventario. Aumentare soltanto quel limite faceva emergere il successivo errore `Snapshot artifact exceeds 64 MiB`: lo stato sintattico formattato occupava 67.986.375 byte, contro 56.039.930 byte in formato compatto.

La correzione porta l'inventario a 100.000 voci e scrive gli indici come JSON compatto. `import-state.json` e `code-index.json` possono raggiungere 256 MiB ciascuno, mentre modello e altri artifact conservano il limite di 64 MiB. I lettori applicano gli stessi limiti dei writer. Validazione interna e hash incrementale evitano copie superflue, mantenendo il formato dei sigilli precedenti e i controlli di freschezza e integrità.

## Esiti sul repository reale

| Percorso | Esito |
| --- | --- |
| CLI, struttura sintattica | Snapshot completo: 9.109 record di inventario, 25.609 dichiarazioni; circa 17 secondi |
| Motore nativo, modalità predefinita con compilatore JS/TS | Importazione e pubblicazione del progetto completate; stessi record e dichiarazioni; circa 41 secondi |
| Riapertura tramite `inspect` | Stessa revisione, stessi conteggi; completata |
| Motore distribuito `out/vs/workbench/contrib/ade/node/adeCodeEngine.js` | Riapertura dello snapshot reale completata, provider `ade-typescript-compiler 6.0.2`; circa 9 secondi |

Lo snapshot della modalità predefinita contiene `import-state.json` di 186.262.814 byte, `code-index.json` di 160.889.484 byte e `model.ade.json` di 29.148.661 byte. Il picco RSS del processo che importa e riapre il progetto è stato circa 4 GiB; quello della sola riapertura nel motore distribuito circa 2,8 GiB. Sono misure singole di questo ambiente, non stime per macOS.

Il compilatore ha analizzato 3.159 file JS/TS e conservato 33.727 diagnostiche; il contesto completo include anche le diagnostiche delle evidenze non risolte. Il clone non ha le dipendenze applicative installate. L'importazione riuscita dimostra inventario, salvataggio e lettura, non compilazione o esecuzione riuscita di Spree. Non sono stati generati diagrammi con un modello IA e non è stata avviata l'interfaccia desktop sul Mac.

## Regressioni automatiche

`npm --prefix ade/code-import test`: **174 test passati**. Include un inventario con 10.025 file accessori e una sorgente Ruby, senza perdere l'ultima voce o le dichiarazioni; esclusione di `node_modules`; lettura degli indici compatti e di quelli formattati precedenti; equivalenza del sigillo completo e di quello incrementale; rifiuto di indici oltre 256 MiB e modelli oltre 64 MiB prima della lettura.

`node --test ade/runtime/test/native-host.test.mjs`: **11 test passati**. Comprende pubblicazione, aggiornamenti incrementali, esclusioni, annullamento e rifiuto di input superati.

Sono passati anche `npm --prefix ade/code-import run check`, ESLint sui moduli modificati e `npm run build-fast -- --client-only`.
