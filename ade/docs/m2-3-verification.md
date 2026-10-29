# Verifica M2.3 — 29 ottobre 2026

Revisione dell'esperienza dell'[editor persistente](visual-editing.md), nello stesso checkout basato su `a8d677e9`. Il collaudo riguarda Linux x64, Node 24.22.1, Electron 43.8.3 e display Xvfb. Non sostituisce la verifica sul MacBook o l'esecuzione della CI remota.

## Modifiche

- Azioni secondarie raccolte in **Project Options**, **Diagram Options** e **Feature Options**, con sezioni native apribili da tastiera che conservano lo stato durante gli aggiornamenti. Salvataggio, cronologia, inserimento di elementi e controlli del canvas restano visibili.
- **Fit Diagram**, sfondo del canvas raggiungibile con Tab e pan con le frecce. L'aiuto accessibile distingue spostamento del nodo e scorrimento della vista.
- Focus conservato durante le modifiche senza riportare la pagina all'inizio. Scorrimento del contenuto e del canvas separato per documento e diagramma: identificatori uguali in due file non condividono accidentalmente la posizione.
- Canvas con scorrimento interno e altezza limitata; proprietà sotto il diagramma nelle finestre strette. I controlli mantengono la propria altezza quando si espandono le opzioni.
- Salvataggio di una copia con conservazione del diagramma e delle selezioni, anche quando il servizio nativo ripristina il documento sorgente. Un salvataggio completato dopo il cambio di progetto non riapre un contesto superato.

## Verifiche osservate

Il nuovo percorso `--ux-only` usa un profilo pulito e abilita soltanto i temi integrati dichiarativi. La configurazione del tema passa attraverso il watcher reale delle impostazioni. Sono verificati finestra 800 × 800, assenza di scorrimento orizzontale del contenuto esterno al canvas, proprietà sotto il diagramma, Tab/Invio sui nodi, pan da tastiera, adattamento del diagramma, conservazione dello scorrimento, separazione fra documenti con gli stessi ID, apertura delle opzioni con Invio, rinomina dalla palette e salvataggio/ripristino nel canvas.

Il controllo del testo del nodo selezionato usa i colori effettivi calcolati dal browser, risolvendo gli sfondi trasparenti lungo gli antenati:

| Tema | Contrasto del testo del nodo selezionato | Indicatore di focus da tastiera |
| --- | --- | --- |
| Light Modern | 17,14:1 | Presente |
| Dark Modern | 11,99:1 | Presente |
| Dark High Contrast | 21,00:1 | Presente |
| Light High Contrast | 12,33:1 | Presente |

Questi risultati riguardano il controllo indicato: non costituiscono una certificazione completa di accessibilità. Le schermate `ux-vs.png`, `ux-vs-dark.png`, `ux-hc-black.png` e `ux-hc-light.png` sono prodotte in `.build/ade-smoke/`.

La prova di attivazione forzata della modalità screen reader nel profilo Linux headless non è conclusiva: il renderer si è chiuso durante l'attesa dell'albero accessibile del terminale. Il collaudo ripetibile mantiene la modalità ordinaria e usa il renderer DOM del terminale; la lettura con una tecnologia assistiva reale resta una verifica aperta. Il modulo locale `node-pty` è stato ricompilato contro gli header Electron disponibili; l'accelerazione GPU del terminale è disabilitata soltanto nel profilo di smoke per Xvfb.

Il modulo `native-keymap` non è compilato nell'ambiente locale: le scorciatoie sono state esercitate con il fallback del workbench. Questo non certifica layout fisici o combinazioni specifiche delle tastiere macOS.

Il percorso `--native-only` ripete il collaudo completo M2.2 con tutte le estensioni integrate disabilitate: creazione di progetto e feature, struttura e flusso con alternative, modifica delle proprietà, spostamento da tastiera e trascinamento, zoom, cancellazione annullabile, salvataggio e riapertura, conflitto con un aggiornamento esterno, recupero delle modifiche non salvate e scarto esplicito. La consultazione di File, Debug e Git conserva diagramma e selezione al ritorno; questo verifica la navigazione ai pannelli, non l'esecuzione di debugger o provider Git.

Il nuovo caso desktop di **Save Project Copy** verifica il contenuto della copia, l'integrità del file originale e il ripristino di diagramma e selezione dopo il riavvio, senza aprire una scheda JSON. Entrambi i percorsi Electron terminano con esito positivo nella configurazione Linux dichiarata.

Nel percorso UX il terminale integrato esegue `printf` e lo smoke verifica la riga di output attesa nel renderer DOM, quindi ritorna allo stesso diagramma e alla stessa selezione. Il controllo non si limita alla comparsa del pannello.

Controlli mirati superati: `npm run ade:check`, ESLint sul contributo e sui registri di accessibilità modificati, Stylelint sul CSS, build incrementale del client, sintassi dello smoke, 21 test del dominio e 19 casi nel runner del contributo (incluso il controllo degli errori inattesi). Il runner comprende le regressioni documentali e sei test della lettura accessibile. Il controllo mirato dei confini architetturali analizza 17 file non di test senza violazioni. I test di dominio non sostituiscono lo smoke Electron.

## Prosecuzione: lettura e aiuto accessibili

La [lettura testuale del diagramma](accessibility.md) usa Accessible View nativa con provider e aiuto contestuali ad A.D.E. Il contenuto deriva dal servizio del progetto, non dall'SVG: include relazioni e condizioni, proprietà della selezione, appartenenza, obbligatorietà dei campi e conteggi delle evidenze dichiarate. Le relazioni della selezione fuori dal diagramma hanno una sezione distinta. Caricamento, Home, diagrammi vuoti ed errori non mostrano il vecchio diagramma come corrente.

Verifiche Electron Linux del nuovo percorso:

- Apertura con le scorciatoie native da nodo e sidebar, tramite **Read Diagram** e tramite **Open Accessible View** nella palette.
- Aiuto contestuale con le associazioni dei tasti effettive. I test del contenuto verificano anche la distinzione fra navigazione in sola lettura e operazioni di editing.
- Escape sul controllo di origine; ripristino anche dopo che un aggiornamento esterno ha sostituito il nodo selezionato.
- Aggiornamento di diagramma e selezione nel lettore aperto; passaggio a errore su JSON invalido e recupero dopo riparazione.
- Nessuna scrittura del file per aprire lettore o aiuto; contenuto di test riportato al valore iniziale dopo le modifiche esterne simulate.
- `accessibility.verbosity.ade` disattiva e riattiva i suggerimenti a runtime. Una scorciatoia personalizzata cambia il suggerimento e apre effettivamente il lettore.
- L'aiuto del terminale continua a essere gestito dal provider del terminale; il provider A.D.E non intercetta le altre superfici.

La schermata `accessible-diagram.png` viene prodotta in `.build/ade-smoke/`. La prova usa il lettore nativo in modalità ordinaria: non richiede di forzare la modalità screen reader del processo Electron e non certifica la lettura vocale con VoiceOver.

## Riproduzione e chiusura

```sh
node ade/scripts/smoke-desktop.mjs --native-only
node ade/scripts/smoke-desktop.mjs --ux-only
```

Su Linux senza display anteporre `xvfb-run -a`. I due percorsi sono configurati nel workflow desktop per Linux e macOS; la nuova esecuzione remota resta da effettuare.

Per chiudere M2 rimangono:

1. Eseguire i due percorsi sulla build macOS corrente, verificando anche Command+S, undo/redo, dialoghi di cartella e recupero dopo chiusura.
2. Verificare con VoiceOver lettura della navigazione, sezioni espandibili, aiuto del canvas e proprietà; controllare visivamente i quattro temi con scala del display abituale.
3. Eseguire la CI desktop e la CI leggera sulla revisione integrata e registrare gli esiti.
4. Raccogliere la revisione UX dell'utente sul percorso completo da progetto vuoto a struttura/flusso salvati.

Il routing delle relazioni resta elementare e può sovrapporre etichette e nodi; condizioni e relazioni rimangono leggibili nelle proprietà. Routing avanzato, ulteriori costrutti UML e navigazione del sistema appartengono a M3. Importazione, Sync del codice e provider IA sono pianificati in [ADR 0003](decisions/0003-code-import-sync-and-providers.md), senza funzionalità IA simulate nel prodotto M2.
