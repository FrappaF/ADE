# Verifica su progetti indipendenti — 30 ottobre 2026

Le funzioni visuali M2/M3 operano sul modello semantico A.D.E del documento corrente. Non richiedono le identità, i nomi o la struttura del progetto di acquisto. Questa verifica amplia la copertura oltre il demo; non costituisce una garanzia per ogni progetto, dimensione o piattaforma.

Un repository esistente può essere aperto con gli strumenti tecnici Code OSS. Per usare le funzioni semantiche deve però esistere un modello nel formato supportato (v3, con lettura dei v2). L'importazione automatica dal codice è ancora in M4; generazione e riconciliazione restano nelle milestone successive. Tipi, condizioni e contratti sono dichiarazioni del modello; Change Impact segue i riferimenti dichiarati e non analizza il codice.

## Progetti e casi verificati

- [Biblioteca civica](../examples/library.ade.json): due feature, risorsa annidata condivisa fra prospettive, due cicli di vita, contratto non collocato e diagramma vuoto.
- [Osservatorio](../examples/observatory.ade.json): gerarchia e relazioni differenti, ciclo di dipendenze, Unicode, risorse omonime e nessun diagramma iniziale. Riusa deliberatamente alcuni ID della biblioteca per verificare l'isolamento fra documenti.
- **Laboratorio da zero**: creato nell'app desktop da una cartella vuota, senza un file demo nel workspace. Creazione di feature, struttura e flusso, contratto, sequenza, stati, transizione e report di impatto; undo/redo, salvataggio e ripristino dopo riavvio.
- Tre modelli vuoti costruiti con le operazioni di dominio, nomi diversi e ID validi come `hasOwnProperty` e `constructor`.
- Ventiquattro grafi generati indipendentemente con catene di 4–27 dipendenti, cicli, omonimi e nodi isolati. Il risultato atteso dell'impatto resta valido dopo sostituzione di tutti gli ID, inversione degli array e modifiche al layout.

Le fixture biblioteca e osservatorio sono scritte separatamente dal checkout, non sono copie del suo grafo con nomi diversi. I test controllano lettura e validazione, navigazione, mappa completa, cicli di vita, sequenze, impatto, rimozione locale, cancellazione globale e conservazione delle altre identità. Un caso separato aggiunge mappature ed evidenze sintetiche su revisioni diverse a entrambi i modelli, verificando esiti discordanti e criteri senza record; gli esempi pubblicati restano senza evidenze inventate. I test nativi aggiungono copia, riavvio, cambio documento con ID coincidenti e cronologia senza selezioni obsolete.

L'ispezione dei moduli di produzione non ha trovato algoritmi che dipendano dai nomi o dagli ID del checkout. I riferimenti al demo restano nel suo caricamento esplicito, nell'inizializzazione e nella compatibilità del precedente contesto di navigazione.

## Correzioni e controlli

Le scelte di risorse, elementi esistenti e destinazioni delle relazioni mostrano ora l'ascendenza per distinguere gli omonimi. Un progetto con feature esistenti ma senza diagrammi offre **Add Diagram** e una guida coerente anche nel lettore accessibile.

Verifiche locali su Linux x64, Node 24.22.1, Electron 43.8.3 e Xvfb: **59 test di dominio**, **44 test nativi**, typecheck ADE, build client incrementale, ESLint mirato, sintassi dello smoke e parsing YAML. Il percorso desktop dedicato è superato, con ricerca da tastiera dei contratti non collocati, scelta della risorsa omonima tramite ascendenza e assenza di dati obsoleti al cambio documento. Le schermate `.build/ade-smoke/independent-library.png` e `independent-observatory.png` sono state ispezionate. Per ripeterlo:

```sh
xvfb-run -a node ade/scripts/smoke-desktop.mjs --projects-only
```

Il workflow desktop include questo percorso su Linux e macOS. La configurazione non attesta un'esecuzione remota riuscita. Restano il collaudo macOS/VoiceOver, la revisione UX, le prestazioni su grandi modelli e la prova su progetti reali degli utenti. Le limitazioni del sottoinsieme visuale sono nella [guida M3](semantic-explorer.md).
