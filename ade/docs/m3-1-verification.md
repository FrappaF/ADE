# Verifica M3.1 — 29 ottobre 2026

Incremento dell'[esploratore semantico](semantic-explorer.md) sullo stesso checkout basato su `a8d677e9`. Ambiente locale Linux x64, Node 24.22.1, Electron 43.8.3 e display Xvfb; nessuna certificazione aggiunta per macOS, VoiceOver o CI remota.

## Controlli automatici

- 25 test del dominio: comprendono destinazioni semantiche, preferenza del diagramma corrente, contratti non collocati, ascendenza, rinomine, selezioni eliminate, cronologia limitata e ramificazione avanti/indietro.
- 25 casi nel runner del contributo, compreso il controllo degli errori inattesi: ripristino e salvataggio delle schede, isolamento fra file con identificatori coincidenti, eliminazione della selezione, watcher correlato, conservazione delle modifiche non salvate e recupero di un file inizialmente mancante.
- Typecheck ADE, build client incrementale, ESLint sui file TypeScript toccati, Stylelint sul CSS e controllo della sintassi dello smoke.
- Controllo architetturale mirato su 18 file non di test, senza violazioni.

## Percorso Electron

Il nuovo `--navigation-only` disabilita le estensioni integrate e usa un profilo temporaneo. Il file aperto nella seconda parte della prova è esterno alla cartella del workspace, così il monitoraggio del modello non può dipendere dal solo watcher ricorsivo del workspace.

Il percorso esercita:

1. Ricerca per tipo **Contract** e apertura del contratto non collocato «Pagamento».
2. Lettura accessibile della scheda, Back/Forward e attraversamento della relazione verso «Richiedi pagamento».
3. Passaggio fra struttura ed esito mantenendo l'identità della selezione e portando il nodo nel focus.
4. Breadcrumb della feature, elenco dei suoi diagrammi e ricerca filtrata per diagrammi.
5. Ramificazione della cronologia e annullamento della ricerca senza cambiare destinazione.
6. Rinomina del contratto da scheda, undo/redo, salvataggio v3 con identificatore invariato e ripristino della stessa scheda dopo il riavvio, senza schede JSON.
7. Eliminazione esterna del contratto e delle sue relazioni, con riparazione del contesto anziché permanenza di una scheda obsoleta.

Le schermate vengono salvate in `.build/ade-smoke/semantic-navigation.png` e `semantic-element-details.png`. La prova ha individuato la dipendenza del ripristino dal monitoraggio generale del workspace: è stato aggiunto il watcher correlato del documento. Ha individuato anche una finestra iniziale in cui il dispatcher accessibile nativo non era ancora registrato: il comando esplicito A.D.E di lettura usa immediatamente lo stesso provider e servizio nativi.

Superati su Linux anche `--ux-only` e `--native-only` sulla stessa implementazione: quattro temi, tastiera, lettore accessibile, finestra stretta, terminale, creazione di progetto/feature, struttura e flusso, undo/redo, conflitti, recupero delle modifiche non salvate e salvataggio di una copia. Lo smoke del prototipo Extension Host rimane separato e non è stato ripetuto per questo incremento nativo.

```sh
node ade/scripts/smoke-desktop.mjs --navigation-only
```

Su Linux senza display anteporre `xvfb-run -a`. Il workflow desktop comprende il percorso su Linux e macOS; il risultato remoto sulla revisione integrata resta da eseguire. La prova fisica con tastiera macOS e VoiceOver resta aperta insieme ai punti M2.3.

M3 rimane in corso: mappa del sistema, filtri ulteriori, routing avanzato delle relazioni, cronologia persistente fra sessioni ed editor estesi non sono consegne di M3.1. Le condizioni restano dichiarazioni progettuali e i conteggi di evidenze derivano soltanto dal documento.
