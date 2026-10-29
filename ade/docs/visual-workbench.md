# Specifica della shell visuale M2.1

Stato: prima implementazione, 29 ottobre 2026. Applica [ADR 0002](decisions/0002-visual-workbench.md). L'editing e la creazione persistente appartengono a M2.2.

Questa specifica conserva il perimetro della shell M2.1; la prosecuzione implementata è descritta nell'[editor persistente M2.2](visual-editing.md).

## Gerarchia e wireframe

Il canvas guida l'attenzione; navigazione e proprietà usano superfici di supporto del tema. La sidebar è un contenitore nativo del workbench, ridimensionabile e raggiungibile dalla barra attività. File, terminale, debugger e Git restano raggiungibili su richiesta.

```text
┌ Sistema e feature ──────┬ Diagramma attivo ───────────────────────┐
│ Home                   │ Home | Percorso acquisto | Pagamento   │
│ Acquisto               ├────────────────────────┬────────────────┤
│   Diagrammi di sistema │ Canvas                 │ Proprietà      │
│ Conferma acquisto      │ elementi selezionabili │ della selezione│
│   Percorso acquisto    │ relazioni e condizioni │ contratti      │
│   Esito pagamento      │                        │ evidenze       │
│ Gestione carrello      │                        │                │
│   Struttura carrello   ├────────────────────────┴────────────────┤
│                        │ File | Terminale | Debug | Git | Modello│
└────────────────────────┴─────────────────────────────────────────┘
```

Nel contratto v2 i diagrammi non dichiarano un proprietario. Per questa shell di lettura, un diagramma è collocato sotto l'unica feature rappresentata dai suoi nodi o dai loro antenati; quando non esiste una feature univoca compare sotto il sistema. Nessun riferimento viene dedotto dai nomi dei file e nessun documento viene modificato per organizzare la navigazione. Componenti e risorse condivisi restano visibili nei diagrammi che li rappresentano e nelle relazioni contestuali delle proprietà.

## Percorsi e stati

| Stato | Presentazione e azione |
| --- | --- |
| Primo avvio | Home nativa, apertura modello e dimostrazione disponibili; creazione progetto e importazione esplicitamente pianificate |
| Modello caricato | Sidebar sistema → feature → diagrammi; canvas del diagramma scelto; proprietà contestuali |
| Cambio diagramma | Titolo e canvas aggiornati; ogni diagramma conserva la propria selezione |
| Modello senza diagrammi | Messaggio esplicito, apertura di un altro modello e ritorno alla home disponibili |
| Caricamento | Stato annunciato, precedente diagramma nascosto; caricamenti superati non possono sostituire quello corrente |
| Errore di lettura o validazione | Diagnostiche localizzate, riprova e apertura di un altro modello; nessuna visualizzazione ingannevole del modello precedente |
| Aggiornamento esterno | Rilettura con watcher correlato, normalizzazione di diagramma e selezione se rimossi |
| Ripristino | URI del modello, diagramma e selezioni per diagramma nel workspace; migrazione del precedente stato M1 |
| Consultazione tecnica | Strumenti upstream su richiesta; ritorno al modello con lo stesso diagramma e selezione |
| Finestra stretta | Proprietà sotto il canvas; canvas scorrevole, sidebar ridimensionabile |

Le operazioni sono raggiungibili tramite pulsanti nativi da tastiera; il focus torna al controllo equivalente dopo un aggiornamento. I nodi hanno nome accessibile e stato di selezione. Le relazioni sono disponibili anche come testo nelle proprietà. Colori, contrasto, spaziature e ruoli tipografici seguono i token del workbench.

## Confini e collaudo

Il modello rimane intento progettuale. Conteggi di mappature ed evidenze derivano esclusivamente dal documento; nessuna chiamata IA o esecuzione viene simulata. M2.2 aggiungerà creazione, modifica, salvataggio, undo/redo, zoom e pan.

Lo smoke nativo usa un profilo pulito senza estensione di sviluppo e disabilita l'attivazione delle estensioni integrate: avvio, sidebar, cambio fra feature, selezione, consultazione tecnica, ripristino, modello vuoto e documento non valido. Il collaudo storico dell'Extension Host resta separato. L'esito effettivo è registrato nel [verbale M2.1](m2-1-verification.md), senza equiparare i test Node al desktop o certificare le estensioni integrate con il solo smoke nativo.

## Contributi recuperati dalla branch M2

La [selezione dal commit parallelo](m2-branch-integration.md) aggiunge gruppi sistema/feature richiudibili da tastiera e conserva il loro stato per documento, anche dopo il riavvio. La selezione dei nodi mantiene i controlli della sidebar. **Related Diagrams** raccoglie i diagrammi che rappresentano discendenti della feature, conservando il proprietario del diagramma e il breadcrumb canonico. **Return to Model** è disponibile con Ctrl+Alt+D su Windows/Linux e Cmd+Alt+D su macOS; conserva anche mappa e schede. L’esempio include ora conferma, esito pagamento, carrello e annullamento acquisto.
