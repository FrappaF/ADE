# Inventario del fork A.D.E

## Personalizzazioni

| Area | File o percorso | Responsabilità |
| --- | --- | --- |
| Identità | `product.json` | Nome, protocollo, cartelle dati, server, tunnel e identificatori desktop separati da Code OSS. |
| Shell nativa | `src/vs/workbench/contrib/ade/browser/` | Home, demo in sola lettura, proprietà, navigazione persistente e indicazione delle funzioni future. |
| Localizzazione | `build/lib/i18n.resources.json` | Registra le stringhe del contributo A.D.E nel sistema di localizzazione upstream. |
| Registrazione | `src/vs/workbench/workbench.common.main.ts` | Importa il contributo A.D.E usando il modello di contributi upstream. |
| Avvio | `src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStarted.contribution.ts` | Aggiunge `adeHome` ai valori dello startup editor; il contributo ADE ne imposta il valore predefinito. |
| Avvio isolato e collaudo | `ade/scripts/` | Profilo di sviluppo separato, smoke desktop e preparazione aggiornamenti upstream. |
| Laboratorio | `ade/prototype/` | Estensione sperimentale e validatore del vecchio JSON; non è il servizio semantico M1. |
| CI | `.github/workflows/ci.yml`, `.github/workflows/desktop.yml` | Verifiche leggere separate da build e smoke desktop Linux/macOS. |
| Provenienza | `ade/upstream.json`, `ade/upstream-workflows/` | Snapshot di base e workflow Microsoft disattivati. |

## Servizi e risorse esterne da decidere prima della distribuzione

| Riferimento | Stato e azione |
| --- | --- |
| Electron, Node, npm, GitHub release | Dipendenze di sviluppo. Versioni e checksum restano quelli upstream. |
| `builtInExtensions` in `product.json` | `ms-vscode.js-debug-companion`, `ms-vscode.js-debug` e `ms-vscode.vscode-js-profile-table` richiedono controllo di licenze, download e redistribuzione. Il collaudo M0 non certifica i debugger. |
| `extensions/copilot/`, SDK IA e agent host upstream | Codice ereditato. Non costituisce un provider A.D.E configurato; la shell segnala IA non disponibile. Definire provider e dati inviati in M5. |
| Autenticazione GitHub/Microsoft, tunnel e remote | Moduli upstream conservati. Credenziali, endpoint e condizioni d’uso vanno valutati prima di offrirli agli utenti. |
| Marketplace e servizi proprietari | Nessuna autorizzazione aggiunta. Non configurare automaticamente il Marketplace Microsoft. |
| `webviewContentExternalBaseUrlTemplate` | Endpoint CDN Microsoft conservato dallo snapshot; sostituzione o rimozione da verificare per il runtime distribuito e il web. |
| Telemetria, esperimenti, aggiornamenti e crash reporting | Il profilo di collaudo li disabilita. Definire esplicitamente i servizi del prodotto prima di M8; non ereditare chiavi o endpoint della distribuzione Microsoft. |
| Icone, risorse, companyName/copyright del packaging | Risorse Code OSS conservate, con avvisi e licenze. Icone originali, attributi del pacchetto, firma, notarizzazione e aggiornamenti utenti appartengono a M8. |

## Confini architetturali

Il contributo in `workbench/contrib/ade` usa editor, dialoghi, registri e storage del workbench. Il modello demo è esplicitamente statico e non dichiara allineamento con il codice. M1 introdurrà il dominio semantico in un modulo `common` testabile senza Electron; i servizi di persistenza e gli adattatori useranno contratti separati, con implementazioni specifiche browser/node. L’IA non deve essere implementata nei gestori DOM: il futuro coordinatore sarà un servizio che consuma modello, adattatori e verifiche. Nessuna dipendenza del core upstream deve puntare verso il dominio ADE: soltanto i punti di registrazione importano il contributo.
