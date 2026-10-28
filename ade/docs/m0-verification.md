# Verifica M0 — 28 ottobre 2026

Base ADE: `2395c5ad` sul branch `work`. Base Code OSS: `98da3bad3433b6aa1abf5638cddc014d70739838`. Ambiente di verifica: Linux x64 gestito, Node **24.22.1** selezionato da `.nvmrc`, npm **11.19.1**. Questo ambiente non certifica macOS arm64.

## Esito

**Collaudo desktop locale superato, confermato dall’utente il 28 ottobre 2026.** Sul MacBook, dopo aver sostituito Node 20.6.0 con la versione richiesta, l’utente conferma installazione, compilazione, download di Electron, avvio, ripristino, uscita con ⌘Q e smoke automatico riusciti sul branch `work` con commit pubblicato `d3ceb3d5`. L’agente non ha eseguito direttamente il collaudo sul Mac. Versione macOS, architettura e log completo dello smoke non sono stati forniti. La CI remota e le verifiche manuali aggiuntive elencate sotto restano da registrare.

| Punto | Evidenza | Stato |
| --- | --- | --- |
| Versione Node richiesta | Eseguiti controlli con Node 24.22.1 | Verificato su Linux x64 |
| Prototipo: sintassi e test | Comandi `check` e `test`; validazione, riferimenti e rendering sicuro | Verificato |
| Dipendenze e build desktop | Installazione e build sul MacBook confermate dall’utente | Superato su Mac; blocco Linux storico sotto |
| CI desktop iniziale | `.github/workflows/desktop.yml`, build macOS e smoke nell'Extension Host | Aggiunta; esecuzione remota da verificare |
| Shell A.D.E nativa | `ade.workbench.open`, home, modello, proprietà, IA, ripristino per workspace | TypeScript verificato; navigazione e ripristino confermati dall’utente |
| Funzioni future esplicite | Creazione visuale e importazione indisponibili; nessuna chiamata IA simulata | Implementato; da collaudare |
| Isolamento dati | Branding `.ade`; guida con `--user-data-dir` e `--extensions-dir` separati | Ripristino confermato; confronto fra due profili da registrare |
| Inventario core e servizi | [Manutenzione](fork-maintenance.md) | Documentato |
| Aggiornamento upstream di prova | Branch temporaneo isolato; conflitti nei workflow documentati | Verificato senza cambiare il branch di lavoro |

Controlli locali conclusi: **11 test del dominio** e **3 test del prototipo** superati; `ade:check`, ESLint sui file TypeScript modificati, Stylelint sulla shell e `git diff --check` senza errori. Schema 2020-12 ed entrambi gli esempi validi verificati anche con un validatore JSON Schema indipendente. I workflow sono validi come YAML; non è stata osservata una loro esecuzione GitHub Actions.

## Blocco della build nell’ambiente cloud (precedente al collaudo Mac)

Il primo tentativo nel sandbox senza accesso di rete ha fallito con `EPERM` sul proxy. Con accesso di rete abilitato, il download degli header Electron **43.8.3** è riuscito. I tentativi successivi hanno evidenziato:

- La cache predefinita Playwright fuori dal workspace non è scrivibile; impostare `XDG_CACHE_HOME`/`PLAYWRIGHT_BROWSERS_PATH` a una directory scrivibile.
- Il download opzionale di Chromium da `cdn.playwright.dev` riceve **403 Domain forbidden** dalla policy dell'ambiente. Per compilare e usare lo smoke Electron qui previsto si può usare `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`; questo non abilita i test browser Playwright.
- L'installazione di `foundry-local-sdk@2.2.1` si interrompe durante il recupero di `Microsoft.ML.OnnxRuntime 1.31.0`, con `getaddrinfo EAI_AGAIN` per i feed NuGet. Il relativo installer usa `https.get` e non risulta funzionante con il proxy di questo ambiente.
- Mancano i pacchetti di sviluppo Linux `x11`, `xkbfile`, `libsecret-1` nel percorso `pkg-config`, e manca Xvfb. Un accesso di rete funzionante da solo non completa i prerequisiti grafici e nativi.

Per verificare TypeScript e lint sono state installate le dipendenze JavaScript con `npm ci --ignore-scripts --no-audit --no-fund`. **Questo non è un'installazione desktop valida**: non sono stati completati gli hook di installazione root, build ed estensioni. Non usare questa directory `node_modules` come prova di avvio riuscito. Ripetere l'installazione completa su una macchina predisposta o nella CI desktop.

## Collaudo necessario per chiudere M0.1 e M0.2

Da un clone pulito, selezionare Node da `.nvmrc`, predisporre la toolchain nativa e seguire la [guida al fork](fork-development.md). Registrare SHA ADE, piattaforma, architettura, Node, Electron e risultati.

1. Concludere `npm ci`, `npm run compile` e `npm run electron` senza errori.
2. Eseguire lo smoke `ade/prototype/desktop/smoke.cjs` nell'Extension Development Host usando il comando della guida; deve aprire il workspace, attivare il prototipo e aprire la shell nativa tramite comando.
3. Dalla palette eseguire **A.D.E: Open Project Home**, aprire l'esempio e navigare fra modello, proprietà e IA. Verificare tema, contrasto, tastiera e apertura di un altro workspace.
4. Aprire `ade/examples/checkout.ade.json` dalla shell; cambiare il nome di un elemento da un editor tecnico, salvare e verificare l'aggiornamento. Un documento invalido deve mostrare diagnostica senza presentare il vecchio modello come corrente.
5. Selezionare un elemento e una sezione, riavviare con lo stesso profilo e controllare il ripristino di editor, file, sezione e selezione. Aprire un secondo profilo isolato e verificare che non erediti il contesto del primo.
6. Eseguire `A.D.E: Apri modello visuale` del prototipo, aprire l'esempio v1 e verificare l'aggiornamento della webview dopo una modifica.

Lo smoke automatico verifica apertura workspace, registrazione comandi, attivazione del prototipo e navigazione fra editor. Il ripristino dopo riavvio è stato confermato dall’utente. Le verifiche aggiuntive su contenuto della webview, documenti invalidi, accessibilità e confronto fra due profili non sono state confermate singolarmente.
