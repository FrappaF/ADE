<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# Correzione Node del runner desktop

Il comando di verifica poteva mostrare `Trusted runner requires Node 24.22.1` anche dopo `nvm use`: l'engine gira nel utility worker di Electron, il cui Node incorporato non coincide con quello standalone selezionato nel terminale. I test standalone non riproducevano questa differenza.

Il bridge inoltra soltanto `structuralVerify` a un processo Node esterno quando l'host è Electron. Il processo importa lo stesso bundle produttivo, riceve la richiesta revisionata tramite stdin e riusa validazione, lock, runner e journal. Preparazione, pubblicazione, undo e il percorso standalone mantengono le API esistenti. Non viene rimosso il requisito Node 24.22.1 e non cambia l'archetipo Node/Bun.

`dev.sh` conserva il percorso effettivo di Node in `ADE_NODE_EXECUTABLE`; un percorso assoluto esplicito ha precedenza. Senza configurazione il worker cerca `node` nel PATH host. La versione viene verificata prima di importare l'engine; eseguibili Electron/Bun, versioni diverse e configurazioni relative sono rifiutati. Il modello/provider non può fornire il percorso dell'eseguibile o del bundle. L'ambiente del processo esterno conserva i binding host, compreso Bun, e rimuove `NODE_OPTIONS`, `NODE_PATH` e `ELECTRON_RUN_AS_NODE`.

La comunicazione usa argomenti separati e stdin, senza shell, output massimo 16 MiB e deadline 120 s. La cancellazione viene prima inoltrata al controller dell’engine tramite SIGTERM per terminare i test e rilasciare i lock; dopo 2 s è previsto SIGKILL come fallback. I processi di verifica annidati rimangono nel gruppo del runner esterno per consentire la cancellazione dell'intero gruppo su POSIX. Il comportamento Windows resta distinto e non è certificato da queste prove.

Le prove coprono scelta del percorso Electron/standalone, verifica reale 8+8, versione errata, path relativo, cancellazione prima dell'avvio e terminazione di un processo annidato. Il launcher è provato con processi reali e un punto di ingresso Electron sostitutivo. L'integrazione sul bundle ESM usa la selezione host Electron simulata; non è un collaudo completo del desktop macOS. Il [report](../benchmarks/desktop-node-runner-2026-11-09.json) conserva risultati e hash; le evidenze DAI-12 precedenti restano storiche.

Per aggiornare il clone locale, chiudere A.D.E e dalla radice eseguire:

```sh
git pull --ff-only
nvm use
export ADE_NODE_EXECUTABLE="$(node -p 'process.execPath')"
npm run build-fast -- --client-only
./ade/scripts/dev.sh
```

Conservare anche `ADE_BUN_EXECUTABLE` se si prova Bun. Riaprire il progetto e ripetere **Run Real Verification** sulla review corrente; non serve rigenerare o cancellare il progetto per questo errore.
