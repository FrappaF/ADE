# Verifica M3.2 — 29 ottobre 2026

Incremento dell'[esploratore semantico](semantic-explorer.md), sul checkout basato su `a8d677e9`. Ambiente Linux x64, Node 24.22.1, Electron 43.8.3 e Xvfb. M3 resta in corso; questo verbale riguarda mappa del sistema e leggibilità delle relazioni.

## Controlli automatici

- 32 test del dominio: copertura completa e senza duplicati delle identità/relazioni nella mappa, indipendenza dai diagrammi, riassegnazione della gerarchia, omonimi ed elementi non collocati; routing attorno agli ostacoli, auto-collegamenti, relazioni parallele/inverse, porte bloccate ed etichette vicine o separate con linea guida.
- 27 casi del runner nativo, compreso il controllo degli errori inattesi: mappa nella cronologia, copia e riavvio, conservazione delle selezioni dei diagrammi e lettura accessibile senza presentare il diagramma precedente come corrente. Restano comprese le regressioni di documenti, watcher, undo/redo, salvataggio, conflitti e recupero.
- Typecheck ADE, build client incrementale, ESLint mirato, Stylelint, sintassi dello smoke e controllo delle differenze.
- Controllo architetturale mirato sui 20 file non di test del contributo e delle registrazioni accessibili, senza violazioni.

## Percorsi Electron

Esito locale: superati tutti e tre i percorsi descritti di seguito, compresi mappa in finestra stretta sui quattro temi e ritorno al modello dal terminale.

`--navigation-only` comprende ora apertura della mappa, copertura dei pulsanti rispetto a elementi e diagrammi, lettura nativa, ritorno al controllo con Escape, Tab/Shift+Tab/Enter, breadcrumb del sistema, Back/Forward e riavvio sulla mappa. Conserva il percorso M3.1 con modifica di un contratto, salvataggio, riavvio e cancellazione esterna in un modello fuori dal workspace. Il renderer verifica le etichette effettive rispetto ai rettangoli di nodi ed etichette precedenti. Schermate: `.build/ade-smoke/system-map.png` e `routed-connections.png`.

`--ux-only` copre lettura e aiuto accessibile, aggiornamenti esterni, quattro temi su diagramma e mappa, tastiera, finestra stretta e ripetibilità di Fit Diagram. La prova ha individuato una variazione dello zoom fra due adattamenti: ora il testo viene misurato prima della trasformazione e la larghezza disponibile usa il bordo stabile del viewport, indipendente dalla scomparsa delle scrollbar. La revisione delle schermate ha inoltre portato ad avvicinare le etichette alle connessioni con linee guida ortogonali corte dove c'è spazio.

È emersa anche una finestra iniziale in cui i comandi accessibili nativi non avevano ancora acquisito le implementazioni dal registro, installato nella fase Eventually. ADE registra ora implementazioni di avvio con priorità inferiore, con lo stesso ambito di focus e lo stesso provider; quando il dispatcher generale è pronto prevale la registrazione ordinaria. Le implementazioni sono rilasciate con il contributo e non intercettano strumenti tecnici esterni ad ADE.

`--native-only` copre il percorso di editing e persistenza: creazione di progetto/feature, struttura e flusso, spostamenti, undo/redo, salvataggio e copia, conflitti, riapertura e recupero delle modifiche non salvate, più esecuzione di un comando nel terminale. I tre percorsi sono separati nella CI desktop Linux/macOS; i risultati qui registrati sono locali Linux.

```sh
node ade/scripts/smoke-desktop.mjs --navigation-only
node ade/scripts/smoke-desktop.mjs --ux-only
node ade/scripts/smoke-desktop.mjs --native-only
```

Su Linux senza display usare Xvfb. Non è stato ripetuto lo smoke del prototipo Extension Host: l'incremento appartiene al workbench nativo.

## Confini aperti

La mappa è una panoramica gerarchica derivata, non un nuovo diagramma persistito. Il routing evita i nodi ma non garantisce l'eliminazione degli incroci fra tutte le connessioni o le linee guida. La separazione di quantità arbitrarie di relazioni parallele e le prestazioni su grandi modelli richiedono ulteriori incrementi. Nodi sovrapposti senza porte accessibili producono una segnalazione; le relazioni restano leggibili nelle proprietà e nel lettore.

macOS, tastiera fisica, VoiceOver e CI della revisione integrata rimangono aperti. Nell'ambiente Linux la mappatura fisica della tastiera usa ancora il fallback già descritto in M2/M3.1. Nessuna deduzione di comportamento runtime, importazione del codice, provider IA o Sync viene aggiunta. Il prossimo incremento è M3.3, editing dei contratti comportamentali.
