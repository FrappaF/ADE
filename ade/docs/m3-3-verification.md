# Verifica M3.3 — 30 ottobre 2026

Incremento dell'[esploratore semantico](semantic-explorer.md), basato su `main` aggiornato a `3851be03`, sulla branch separata `feat/roadmap-next`. Ambiente Linux x64, Node 24.22.1 selezionato da `.nvmrc`, Electron 43.8.3 e Xvfb. M3 resta in corso e questo verbale non chiude le verifiche di piattaforma M2/M3 precedenti.

## Comportamento disponibile

L'editor nativo modifica input/output con nome, tipo e obbligatorietà, precondizioni, postcondizioni ed errori da proprietà e schede, comprese identità non collocate e prive di comportamento. Ogni voce completata passa dal servizio documentale condiviso come operazione atomica; Escape non conserva parti di una voce incompleta. Le associazioni degli errori alle relazioni si scelgono fra gli errori della sorgente e possono essere rimosse esplicitamente. Un errore referenziato non può essere rinominato o eliminato lasciando riferimenti pendenti.

Proprietà e lettore accessibile riflettono il contratto corrente; i diagrammi conservano riferimenti alla stessa identità. Layout, autorizzazioni, criteri di accettazione e registrazioni di evidenza restano conservati. L'esempio `checkout-designed.ade.json` include input, output, condizioni e percorso di pagamento rifiutato con riferimento all'errore dichiarato. Nessuna modifica allo schema v3 e nessuna dichiarazione di implementazione o esecuzione dedotta dal contratto.

## Controlli automatici eseguiti

- Test di dominio: **38 casi superati** nei sei file eseguiti con `npm run ade:test` e verificati anche direttamente con Node. I quattro nuovi casi coprono contratti non collocati e condivisi fra diagrammi, round-trip JSON, indipendenza dei dati del chiamante, conservazione di evidenze e layout, rigetto atomico di voci invalide/duplicate e protezione degli errori referenziati.
- Runner nativo: **34 casi superati**, compreso il controllo degli errori inattesi. I quattro test dei dialoghi verificano cancellazione nelle diverse fasi di un campo, modifica senza aliasing o perdita di sezioni, protezione degli errori referenziati e validazione di nomi vuoti/duplicati. Un nuovo test documentale verifica undo/redo fino al v2 originario, dettaglio/diagramma, salvataggio e riapertura del contratto. Restano inclusi i test di contesto, watcher, recupero e lettura accessibile.
- `npm run ade:check`, build client con `npm run build-fast -- --client-only`, ESLint mirato ai sette file TypeScript modificati o aggiunti, sintassi dello smoke e `git diff --check` superati.

Comando del runner nativo:

```sh
node test/unit/node/index.js --run src/vs/workbench/contrib/ade/test/browser/adeProjectService.test.ts --run src/vs/workbench/contrib/ade/test/browser/workingCopyRecovery.test.ts --run src/vs/workbench/contrib/ade/test/browser/adeAccessibleContent.test.ts --run src/vs/workbench/contrib/ade/test/browser/adeBehaviorEditing.test.ts
```

La CI desktop include ora i test dei dialoghi nello stesso runner.

## Smoke Electron eseguito

Il percorso `--navigation-only` è stato eseguito con esito positivo su Xvfb. Copre creazione di tutte e cinque le sezioni, nomi duplicati, cancellazione di campi incompleti, modifica/rimozione, undo/redo, proprietà in due diagrammi, lettore accessibile, salvataggio e riavvio. Dopo il riavvio il contratto conserva tipo e obbligatorietà dell'output modificato. La cancellazione esterna dell'identità ripara il contesto senza dettagli obsoleti. Il percorso include anche le regressioni M3 su mappa, routing, gruppi della sidebar e riferimenti condivisi. Nessun Extension Development Host viene usato.

Schermata del contratto ispezionata in `.build/ade-smoke/behavioral-contract.png`; il resto delle schermate è nella stessa directory. Il percorso è ripetibile con:

```sh
xvfb-run -a node ade/scripts/smoke-desktop.mjs --navigation-only
```

## Limiti dell'ambiente e verifiche aperte

Il ripristino completo delle dipendenze native si arresta su `native-keymap` per i metadati e header mancanti di `x11` e `xkbfile`. Gli strumenti JavaScript root e build sono stati installati senza lifecycle scripts e `@vscode/sqlite3` è stato compilato separatamente per completare il ripristino dello storage desktop. Electron è stato scaricato con il supporto proxy di Node; Xvfb è stato estratto in `/tmp` da un pacchetto Debian e avviato direttamente, senza installazioni di sistema. Lo smoke verifica questo percorso Linux con fallback della mappatura tastiera; non certifica una toolchain nativa completa né la tastiera fisica.

Restano da eseguire macOS, VoiceOver e CI remota della revisione. I percorsi completi `--native-only` e `--ux-only` non sono stati ripetuti in questa sessione: lo smoke mirato non aggiorna le relative verifiche di M2/M3 precedenti. Autorizzazioni e criteri di accettazione sono consultabili e conservati, ma non modificabili con questo editor. Tipi e condizioni sono testo dichiarativo, senza controllo di un linguaggio, esecuzione, analisi del codice o Sync. Sequenze, stati estesi e impatto appartengono agli incrementi M3 successivi.
