# Sviluppare ADE dai sorgenti

## Da un clone pulito

Installa Git, Python 3, un compilatore C/C++ e la versione Node indicata in [`.nvmrc`](../../.nvmrc), con il relativo npm. La configurazione scarica dipendenze npm, header Node, Electron e le estensioni integrate.

- Su **macOS**, installa i Command Line Tools (`xcode-select --install`) e verifica `xcode-select -p`, `xcrun --find clang` e `python3 --version`. Su Apple Silicon usa Node arm64.
- Su **Debian e Ubuntu**, installa `build-essential pkg-config libx11-dev libxkbfile-dev libkrb5-dev libsecret-1-dev libgtk-3-dev libgbm-dev libnss3 libasound2-dev xvfb xauth`. I nomi possono variare tra distribuzioni.
- Su **Windows**, segui i [prerequisiti Visual Studio e C++ di Code OSS](https://github.com/microsoft/vscode/wiki/How-to-Contribute#prerequisites). La CI desktop di ADE copre Linux e macOS.

Su macOS e Linux esegui questi comandi dalla radice del clone con `nvm`.

```sh
nvm install
nvm use
npm run ade:setup
./ade/scripts/dev.sh
```

Con un altro gestore Node seleziona la stessa versione. Lo script `ade:setup` prepara gli header, installa dai lockfile e compila client, motore ADE, estensioni ed Electron. `npm run ade:setup -- --install-only` installa le dipendenze senza compilare e `npm run ade:setup -- --help` elenca le opzioni.

Su macOS e Linux `./ade/scripts/dev.sh /percorso/del/progetto` apre una cartella specifica e usa un profilo di sviluppo in `.build/`. Su Windows avvia `scripts\code.bat --user-data-dir .build\ade-profile --extensions-dir .build\ade-extensions` dopo la preparazione. Al primo avvio può servire una connessione per le estensioni integrate.

Dopo un aggiornamento del clone, chiudi l’app e riesegui `npm run ade:setup`. Durante lo sviluppo, con dipendenze aggiornate, `npm run build-fast -- --client-only` ricompila il client.

## Verificare una modifica

```sh
npm run ade:test
npm run ade:check
npm run ade:smoke:check
```

`ade:test` esegue i test del dominio. `ade:check` controlla i tipi e `ade:smoke:check` controlla i tipi del collaudo desktop. Per provare l’app dopo la build usa `node ade/scripts/smoke-desktop.mjs --native-only`. Su Linux senza display anteponi `xvfb-run -a`.

I tool in `ade/runtime`, `ade/code-import`, `ade/ai` e `ade/messaging` hanno lockfile e test propri. La [mappa dell’architettura](architecture.md) aiuta a scegliere il pacchetto da verificare. GitHub Actions esegue i controlli e il collaudo desktop su Linux. Il collaudo macOS è disponibile dall’avvio manuale del workflow **ADE desktop**.

## Aggiornare la base Code OSS

La revisione upstream è in [`ade/upstream.json`](../upstream.json). Per provare un aggiornamento su un worktree dedicato, usa `node ade/scripts/prepare-upstream.mjs SHA_COMPLETO /percorso/assoluto/nuovo-worktree`. Lo script applica il delta fra revisioni e si ferma se il delta tocca i workflow Microsoft. I workflow upstream sono conservati come file `.disabled` in `ade/upstream-workflows/`. Prima di integrare l’aggiornamento, controlla la registrazione del contributo ADE, le impostazioni del prodotto e le verifiche interessate dal delta.
