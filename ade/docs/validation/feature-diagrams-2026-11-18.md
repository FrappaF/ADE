<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# Dalla codebase ai diagrammi per feature · 18 novembre 2026

Il benchmark usa il servizio di produzione con sessioni a checkpoint per scoperta, pianificazione e preparazione delle viste. La rubrica Mercato controlla il catalogo Acquisto → Resi, le evidenze nei sorgenti, le anteprime e il riuso dell’identità dell’archivio ordini. Le affermazioni sul comportamento richiedono la verifica umana descritta nella rubrica. [Fixture Mercato](../../examples/guida/07-mercato-laboratorio/codice-ia/) · [Rubrica](../../scripts/diagram-feature-rubric.mjs)

## Verifica locale

Su Node 24.22.1 sono passati **23/23 test deterministici**. Le prove esercitano ordine e ripresa dei checkpoint, validazione delle evidenze, riuso degli ID, omonimi indipendenti, review e blocco delle revisioni obsolete. La rubrica è stata provata sia con lo stesso archivio ordini nelle due feature sia con un’identità duplicata e un’evidenza attribuita al modulo sbagliato. Il conteggio include i cinque test indipendenti del comportamento della fixture.

```sh
node --test --test-isolation=none \
  ade/ai/test/diagram-identity.test.ts \
  ade/ai/test/project-diagrams.test.ts \
  ade/ai/test/mercato-diagram-rubric.test.mjs \
  ade/examples/guida/07-mercato-laboratorio/codice-ia/test/mercato.test.mjs
```

## Smoke desktop

L’app ADE avviata con Electron 43.8.3 ha eseguito il percorso predefinito su una copia locale di Mercato, usando il server MCP incluso nella build e una CLI con risposte deterministiche. La prova ha confermato perimetro e modello, aperto e richiuso i dettagli, interrotto la scoperta e ripreso il checkpoint salvato. Sono stati completati in ordine la scoperta, il piano di sistema, piano e vista di Acquisto, piano e vista di Resi. La review ha mostrato i due gruppi e ha pubblicato insieme le viste dopo la conferma. Entrambe usano lo stesso ID di Ordine. Il file `checkout.mjs` ha mantenuto il contenuto iniziale.

Nella stessa build, il percorso **Code** ha aperto il modello Mercato senza sorgenti, `package.json` o Git. Il wizard ha preparato Acquisto e poi Resi con una CLI deterministica. La review ha superato i sette casi indipendenti e ha applicato i file dopo la conferma nell’app. Il JSON del modello è rimasto identico. I sette test hanno superato una seconda esecuzione con `node --test` sui file applicati. [Modello e casi](../../examples/guida/07-mercato-laboratorio/moduli/generazione-ia/)

## Prova con Codex

Il tentativo sul fixture sintetico, con Codex CLI 0.163.0 e `gpt-5.6-terra`, è rimasto bloccato all’avvio. Il filesystem in sola lettura ha restituito `EROFS` quando la CLI ha tentato di aprire il proprio stato d’installazione. Un controllo mirato, approvato per avviare la CLI fuori dal sandbox esterno e inviare solo una stringa sintetica, ha superato l’avvio e ricevuto **HTTP 401 Unauthorized** dal provider. [Problema di avvio segnalato a Codex](https://github.com/openai/codex/issues/42398)

Il report registra **un checkpoint tentato, zero completati, zero chiamate agli strumenti ADE e zero byte recuperati**. L’inventario e lo snapshot attivo risultano invariati. La fedeltà delle proposte del modello e il costo dell’inferenza restano da misurare. Per riprodurre la prova con un account funzionante, avviare il benchmark su una copia del fixture. Il comando salva report e anteprime nella cartella indicata e lascia le proposte in review.

```sh
ade_trial_root=$(mktemp -d)
cp -R ade/examples/guida/07-mercato-laboratorio/codice-ia "$ade_trial_root/project"
npm run ade:diagrams:live -- --features "$ade_trial_root/project" gpt-5.6-terra "$ade_trial_root/report" mercato
```
