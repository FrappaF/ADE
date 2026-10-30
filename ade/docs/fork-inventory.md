# Inventario del fork A.D.E

## Personalizzazioni

| Area | File o percorso | Responsabilità |
| --- | --- | --- |
| Identità | `product.json` | Nome, protocollo, cartelle dati, server, tunnel e identificatori desktop separati da Code OSS. |
| Shell ed editor nativi | `src/vs/workbench/contrib/ade/browser/` | Home, sidebar, canvas modificabile, proprietà, creazione del progetto e servizio documentale condiviso con cronologia e recupero nativi. |
| Dominio visuale | `src/vs/workbench/contrib/ade/common/` | Contratti v2/v3, navigazione, migrazione e operazioni atomiche dell'editor, verificabili senza Electron. |
| Esploratore semantico | `src/vs/workbench/contrib/ade/browser/adeNavigation.ts`, `adeEditor.ts`, `adeProjectService.ts`; `common/visualNavigation.ts`, `systemMap.ts`, `diagramRouting.ts` | Mappa gerarchica, connessioni aggregate e routing ortogonale con etichette misurate. Ricerca nativa, schede degli elementi, percorso semantico, prospettive e cronologia di sessione. Il servizio mantiene un watcher correlato del documento oltre al riferimento al modello testuale. |
| Editing contratti | `src/vs/workbench/contrib/ade/browser/adeBehaviorEditing.ts`, `adeEditing.ts`, `adeEditor.ts`; `common/visualEditing.ts` | Dialoghi nativi per input/output, condizioni ed errori; associazioni degli errori alle relazioni e validazione atomica. Riusa identità, cronologia e persistenza del servizio documentale. |
| Accessibilità visuale | `src/vs/workbench/contrib/ade/browser/adeAccessibility*.ts`, `adeAccessibleContent.ts`; registri in `src/vs/platform/accessibility/browser/accessibleView.ts` e `src/vs/workbench/contrib/accessibility/browser/accessibilityConfiguration.ts` | Provider e aiuto nativi, contenuto testuale derivato dal modello, contesti di focus e suggerimenti configurabili. I registri upstream aggiungono ID e impostazione, senza importare il dominio ADE. |
| Associazioni dei backup | `src/vs/workbench/services/workingCopy/common/workingCopyEditorService.ts`, `workingCopyBackupTracker.ts` | Ricerca dell'editor tramite sola identità del documento e riuso delle associazioni specializzate prima di aprire un editor generico durante il recupero. Nessun import dal dominio ADE. |
| Sidebar predefinita | `src/vs/workbench/contrib/files/browser/explorerViewlet.ts` | L'esploratore file resta disponibile ma non è più il contenitore predefinito; il contributo ADE registra la sidebar iniziale. |
| Localizzazione | `build/lib/i18n.resources.json` | Registra le stringhe del contributo A.D.E nel sistema di localizzazione upstream. |
| Registrazione | `src/vs/workbench/workbench.common.main.ts` | Importa il contributo A.D.E usando il modello di contributi upstream. |
| Avvio | `src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStarted.contribution.ts` | Aggiunge `adeHome` ai valori dello startup editor; il contributo ADE ne imposta il valore predefinito. |
| Avvio isolato e collaudo | `ade/scripts/` | Profilo di sviluppo separato, smoke desktop e preparazione aggiornamenti upstream. |
| Laboratorio | `ade/prototype/` | Estensione sperimentale e validatore del vecchio JSON; non è il servizio semantico M1. |
| Installazione | `build/npm/postinstall.ts`, `build/lib/npmNetworkRetry.ts` | Ripete soltanto la sottocartella npm fallita per errori di rete transitori, con massimo tre tentativi; i fallimenti permanenti restano visibili. |
| CI | `.github/workflows/ci.yml`, `.github/workflows/desktop.yml` | Verifiche leggere separate da build e smoke desktop Linux/macOS. |
| Provenienza | `ade/upstream.json`, `ade/upstream-workflows/` | Snapshot di base e workflow Microsoft disattivati. |

## Servizi e risorse esterne da decidere prima della distribuzione

| Riferimento | Stato e azione |
| --- | --- |
| Electron, Node, npm, GitHub release | Dipendenze di sviluppo. Versioni e checksum restano quelli upstream. |
| `builtInExtensions` in `product.json` | `ms-vscode.js-debug-companion`, `ms-vscode.js-debug` e `ms-vscode.vscode-js-profile-table` richiedono controllo di licenze, download e redistribuzione. Il collaudo M0 non certifica i debugger. |
| `extensions/copilot/`, SDK IA e agent host upstream | Codice ereditato. Non costituisce un provider A.D.E configurato; la shell segnala IA non disponibile. M4 definisce il primo connettore in sola lettura e M5 l'esecuzione assistita, secondo [ADR 0003](decisions/0003-code-import-sync-and-providers.md). |
| Autenticazione GitHub/Microsoft, tunnel e remote | Moduli upstream conservati. Credenziali, endpoint e condizioni d’uso vanno valutati prima di offrirli agli utenti. |
| Marketplace e servizi proprietari | Nessuna autorizzazione aggiunta. Non configurare automaticamente il Marketplace Microsoft. |
| `webviewContentExternalBaseUrlTemplate` | Endpoint CDN Microsoft conservato dallo snapshot; sostituzione o rimozione da verificare per il runtime distribuito e il web. |
| Telemetria, esperimenti, aggiornamenti e crash reporting | Il profilo di collaudo li disabilita. Definire esplicitamente i servizi del prodotto prima di M8; non ereditare chiavi o endpoint della distribuzione Microsoft. |
| Icone, risorse, companyName/copyright del packaging | Risorse Code OSS conservate, con avvisi e licenze. Icone originali, attributi del pacchetto, firma, notarizzazione e aggiornamenti utenti appartengono a M8. |

## Confini architetturali

Il contributo in `workbench/contrib/ade` usa editor, dialoghi, registri e storage del workbench. Dominio e operazioni visuali sono in `common`, verificabili senza Electron. `AdeProjectService` in `browser` mantiene un riferimento al documento tramite `ITextFileService`/`ITextModelService`, condivide modello e contesto fra sidebar, input ed editor, e registra le modifiche validate nella cronologia nativa. I servizi upstream conservano file, backup e conflitti; il modello non dichiara allineamento con il codice. L’IA non deve essere implementata nei gestori DOM: il futuro coordinatore consumerà modello, adattatori e verifiche. Nessuna dipendenza del core upstream punta al dominio ADE; Explorer e gestione dei backup non importano moduli ADE.

L’[integrazione selettiva M2](m2-branch-integration.md) traccia la provenienza del commit `bbfc2087`, la diagnostica separata, i gruppi della sidebar, i riferimenti condivisi e la compatibilità del profilo in `AdeProjectService`. Non introduce un secondo servizio del modello.
