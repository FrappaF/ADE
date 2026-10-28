# Manutenzione del fork (M0.3)

## Personalizzazioni da preservare

| Percorso | Responsabilità A.D.E |
| --- | --- |
| `product.json` | Nome, cartelle dati, protocollo, bundle macOS e issue tracker |
| `README.md`, `ade/docs/`, `ade/upstream.json` | Prodotto, procedure e revisione upstream |
| `src/vs/workbench/contrib/ade/` | Shell browser, dominio semantico puro, esempio dimostrativo |
| `src/vs/workbench/workbench.common.main.ts` | Importazione del contributo A.D.E |
| `build/lib/i18n.resources.json` | Registrazione delle stringhe localizzate del contributo |
| `package.json` | Comandi `ade:check`, `ade:test`, `ade:schema` |
| `ade/schema/`, `ade/examples/`, `ade/scripts/`, `ade/test/`, `ade/tsconfig.json` | Contratti, migrazione, verifica e manutenzione |
| `ade/prototype/` | Laboratorio separato e smoke dell'Extension Host |
| `.github/workflows/ci.yml`, `.github/workflows/desktop.yml` | Controlli ADE attivi |
| `ade/upstream-workflows/*.disabled` | Workflow Microsoft conservati ma non attivi |

Il dominio è nel livello `workbench/contrib/ade/common` e non dipende da browser, Node o Electron. La UI è in `browser` e usa file, storage ed editor upstream. Adattatori linguistici e coordinatore IA saranno servizi separati; il dominio non accede a rete o credenziali.

## Aggiornamento riproducibile

L'importazione è uno snapshot: non fare merge di storie non correlate. Conservare il vecchio SHA e usare un branch ADE dedicato per ogni aggiornamento.

```sh
git clone --bare --filter=blob:none https://github.com/microsoft/vscode.git /tmp/ade-upstream.git
git -C /tmp/ade-upstream.git fetch --depth=1 origin BASE_SHA TARGET_SHA
node ade/scripts/preview-upstream.mjs /tmp/ade-upstream.git TARGET_SHA /tmp/ade-upstream.patch
```

Sostituire `BASE_SHA` con `ade/upstream.json.commit` e `TARGET_SHA` con un SHA completo scelto esplicitamente. Lo script legge la base dal manifest, salva una patch senza sovrascrivere un file esistente e invoca `git apply --check`: non modifica sorgenti, revisioni registrate o branch.

In un worktree pulito `git worktree add -b ade/upstream-TARGET /tmp/ade-update HEAD`, riconciliare la patch e inventariare ogni conflitto. Le modifiche a `.github/workflows/*` Microsoft vanno riportate ai corrispondenti file `.disabled`; non riattivarle automaticamente. Preservare branding, contributo nativo e comandi ADE. Non cambiare `ade/upstream.json` prima di avere applicato tutte le differenze e registrato le verifiche.

Eseguire test del dominio/prototipo, typecheck, lint mirato, build e smoke desktop. Integrare il branch soltanto dopo revisione del risultato. In caso di blocco, conservare SHA e conflitti nel verbale, rimuovere il worktree di prova e lasciare il branch di lavoro invariato. Dopo un'integrazione, il ritorno alla versione precedente avviene con il revert dei commit dell'aggiornamento, incluso il manifest; non usare reset distruttivi di un branch condiviso.

## Prova del 28 ottobre 2026

- Base: `98da3bad3433b6aa1abf5638cddc014d70739838`.
- Revisione candidata osservata su `upstream/main`: `a3ad284029f2b1c907c7c7e00039c228fe24511e`.
- Differenza: **165 file**, **10.015 inserimenti**, **1.356 rimozioni**.
- Creato il branch temporaneo `ade/upstream-rehearsal-20261028` dalla base ADE `2395c5ad` in un worktree isolato. `git apply --check` ha rilevato otto percorsi mancanti: `codeql.yml`, `component-fixtures.yml`, `pr-darwin-test.yml`, `pr-linux-cli-test.yml`, `pr-linux-test.yml`, `pr-node-modules.yml`, `pr-win32-test.yml`, `pr.yml`, tutti sotto `.github/workflows/`.
- Sono conflitti attesi dovuti allo spostamento dei workflow nei file `.disabled`. La patch non è stata applicata; manifest e branch di lavoro sono rimasti invariati. Il worktree e il branch temporaneo sono stati rimossi dopo la registrazione dell'esito. Non è stato eseguito un build della revisione candidata.

Questa prova soddisfa il percorso «conflitti documentati senza compromettere il branch principale». La revisione candidata non diventa automaticamente la nuova base del prodotto.

## Servizi esterni e distribuzione

| Configurazione attuale | Decisione necessaria prima di distribuire |
| --- | --- |
| `builtInExtensions`, metadati publisher e download GitHub | Verificare licenze, redistribuzione e disponibilità delle release |
| `defaultChatAgent`, autenticazione GitHub/Microsoft/Google/Apple, entitlement e quote Copilot | Configurare o rimuovere il flusso upstream; non equivale al coordinatore IA ADE |
| `trustedExtensionAuthAccess` | Rivedere le autorizzazioni delle estensioni effettivamente distribuite |
| `webviewContentExternalBaseUrlTemplate` su `vscode-cdn.net` | Predisporre risorse ADE o eliminare la dipendenza dal servizio |
| `voiceWsUrl` Microsoft e `agentsTelemetryAppName` | Configurare o disattivare voce e raccolta dati prima della distribuzione |
| `nodejsArtifactFeed`, `electronArtifactFeed` vuoti | Download OSS pubblici; nessun accesso implicito ai feed privati Microsoft |
| `serverApplicationName`, server data, tunnel, identificatori Windows/Linux e icone | Completare identità e isolamento delle piattaforme distribuite |
| Licenze, avvisi, firma, notarizzazione e aggiornamenti | Conservare gli avvisi upstream e completare il percorso di distribuzione M8 |

L'inventario identifica configurazioni da decidere: non certifica che i servizi siano stati rimossi o che la distribuzione sia pronta. I workflow Microsoft restano disattivati.
