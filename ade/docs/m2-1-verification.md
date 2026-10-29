# Verifica della prima shell M2.1 — 29 ottobre 2026

Base del lavoro: `a8d677e9`, merge della fondazione M0 con M1 e ADR 0002. Il checkout era pulito: nessun file modificato o non tracciato da recuperare. Il contributo risultante dal merge conservava il dominio M1, ma la shell presentava elenchi e dettagli senza sidebar nativa e canvas. La prosecuzione implementa la prima shell prevista da M2.1, secondo la [specifica visuale](visual-workbench.md).

## Comportamento disponibile

- Avvio sulla home o sul contesto visuale ripristinato con `workbench.startupEditor = adeHome`. Aperture esplicite di file da riga di comando e `--skip-welcome` conservano il loro percorso.
- Sidebar nativa predefinita con sistema, feature e diagrammi, distinta dall'esploratore fisico dei file.
- Canvas in sola lettura basato sulle posizioni M1, relazioni direzionali, selezione con puntatore o tastiera e proprietà contestuali con contratti, condizioni, errori e conteggi delle evidenze effettivamente presenti.
- Diagramma attivo nel titolo dell'editor, passaggio fra diagrammi, selezioni indipendenti e mantenimento dello scorrimento durante la consultazione.
- Accesso agli strumenti tecnici e comando di ritorno al modello; nessuna mappatura verso il codice inventata.
- Contesto condiviso fra sidebar ed editor, ripristino per workspace, compatibilità del precedente stato M1, lettura v1/v2 e watcher correlato.
- Stati di caricamento, errore, recupero, progetto senza diagrammi e diagramma senza nodi; un caricamento superato non può sostituire il documento corrente.

## Verifiche eseguite

Ambiente Linux x64 gestito, Node **24.22.1** da `.nvmrc`, Electron **43.8.3**, display virtuale Xvfb. Sono stati ricostruiti gli header e i moduli nativi necessari a log e SQLite. Nessuna modifica alla configurazione della macchina ospite è necessaria per i file del prodotto.

| Verifica | Esito |
| --- | --- |
| Dominio e navigazione, `node --test --test-isolation=none ade/test/*.test.mjs` | 15 test superati |
| Ciclo di vita del servizio, runner Node upstream sul test `adeProjectService.test.ts` | 6 casi del servizio e controllo degli errori inattesi superati |
| TypeScript del contributo, `npm run ade:check` | Superato, inclusi i nuovi test |
| Build client, `npm run build-fast -- --client-only` | Superata, build completa iniziale e successivi aggiornamenti incrementali |
| ESLint sui contributi ADE e registrazione Explorer | Superato |
| Stylelint sulla shell e controllo dei livelli sul progetto `ade/tsconfig.json` | Superati |
| Smoke Electron nativo, `node ade/scripts/smoke-desktop.mjs --native-only` con Xvfb | Superato |

Lo smoke nativo verifica direttamente avvio, sidebar iniziale senza Explorer, cambio fra due feature e tre diagrammi, proprietà, selezione da tastiera e focus, apertura dei file tecnici e ritorno al modello. Chiude e rilancia Electron, controllando diagramma e selezioni. Apre poi un modello da disco, ripete il riavvio, apre un modello vuoto e un documento invalido, verifica che il canvas precedente non venga mostrato come corrente, riprova e controlla recupero e rilettura dopo modifica esterna. Nessun `--extensionDevelopmentPath` viene usato. Il profilo portable effettivo contiene le impostazioni del collaudo.

Le evidenze dello smoke sono prodotte in `.build/ade-smoke/`: `visual-workbench.png`, `home.png` ed `external-update.png`. La CI separa ora il collaudo nativo da quello storico dell'Extension Host. I test del servizio usano i servizi upstream reali di file e storage in memoria e includono il controllo delle risorse non rilasciate.

## Limiti e prossima consegna

Questo esito riguarda la shell nativa su Linux, con l'attivazione delle estensioni integrate disabilitata. Non certifica la build completa delle estensioni, macOS, un pacchetto installabile o un'esecuzione remota della nuova CI. I collaudi M0/M1 sul MacBook restano evidenze storiche e non vengono estesi automaticamente a questo incremento.

Il controllo dei livelli sull'intero repository ha superato il limite di memoria dell'ambiente ed è stato interrotto dal sistema. Il controllo mirato al progetto ADE, mediante `checkProject` e le stesse `RULES` upstream con radice del repository, ha verificato 9 file di produzione senza violazioni; non equivale a un controllo completo del fork.

Il contratto v2 non dichiara il proprietario del diagramma: la sidebar usa l'unica feature rappresentata dai nodi o dai loro antenati e colloca i casi condivisi sotto il sistema. La revisione UX, temi/contrasto, finestre strette e verifica completa degli strumenti tecnici proseguono con il collaudo M2.3. Il prossimo incremento funzionale è M2.2: creazione di progetto/feature/diagrammi, editing, collegamenti, salvataggio, undo/redo e gestione delle modifiche concorrenti al documento. La creazione e l'importazione restano esplicitamente indisponibili nella home; nessuna chiamata IA viene simulata.
