# Alleggerire il fork A.D.E

## Tre interventi distinti

| Intervento | Effetto | Stato |
| --- | --- | --- |
| Disabilitare una funzione nelle impostazioni | Riduce UI e attività in esecuzione; i sorgenti possono restare nel grafo TypeScript | Copilot e il suo onboarding sono già disabilitati per impostazione predefinita in A.D.E |
| Escludere un componente da installazione e build | Riduce dipendenze, download e lavoro di compilazione | Possibile profilo desktop essenziale, ancora da implementare |
| Separare i programmi TypeScript e i test | Riduce il perimetro verificato da ciascun processo e permette esecuzioni sequenziali | Configurazione di produzione separata aggiunta e adottata nella CI desktop; misurazione riportata sotto |

Il limite di 8 GiB osservato riguarda l’ambiente durante la verifica della codebase upstream. Non è una misura della memoria usata dall’applicazione A.D.E aperta.

## Perimetro TypeScript misurato

Rilevazione del 28 ottobre 2026, snapshot upstream `98da3bad`, Node 24.22.1:

- Sorgenti TypeScript nello snapshot: 11.073 file.
- File nelle cartelle di test e fixture: 3.197.
- Programma di produzione costruito da TypeScript: 7.881 sorgenti, circa il 29% in meno.
- Cinque helper di test restano nel programma perché vengono importati da altri sorgenti. `exclude` limita i file iniziali, ma conserva le dipendenze importate.

Questi conteggi descrivono il grafo dei file; non misurano una riduzione percentuale della RAM. La configurazione `ade/tsconfig.production.json` eredita le regole del compilatore upstream ed esclude i test come file iniziali. Mantiene i servizi e tutte le funzionalità di produzione, incluse quelle attualmente nascoste nell’interfaccia.

```sh
GOMEMLIMIT=3GiB GOMAXPROCS=2 node node_modules/@typescript/native/bin/tsc --project ade/tsconfig.production.json --pretty false
```

**Esito misurato:** controllo di produzione superato in 294,6 secondi, picco RSS del processo di 5.394.948 KiB, circa 5,15 GiB, con `GOMEMLIMIT=3GiB` e `GOMAXPROCS=2`. È una prima esecuzione della nuova configurazione, non una misura del consumo dell’app. [Dati del collaudo](build-footprint-2026-10-28.json).

La verifica mirata della shell resta in `ade/tsconfig.json`; la configurazione globale originale rimane in `src/tsconfig.json`. I test devono continuare a essere eseguiti e verificati separatamente: il risultato della configurazione di produzione non certifica i file esclusi.

## Candidati per un profilo desktop essenziale

- `extensions/copilot/`: la cartella delle sue dipendenze misura circa 1,6 GiB su disco nel workspace di collaudo. Evitarne installazione e build è un primo intervento separabile dalla shell A.D.E. I provider del futuro coordinatore IA A.D.E restano una decisione M5. Anche le dipendenze SDK presenti nella radice vanno inventariate separatamente.
- Server remoto, variante web, tooling e fixture di sviluppo upstream: distinguere ciò che serve allo sviluppo del fork da ciò che viene distribuito con il desktop. Non escludere gli strumenti necessari ai test mantenuti.
- Chat, agent host, finestra Sessions e notebook: richiedono analisi delle registrazioni e delle dipendenze fra servizi. Nel sorgente attuale agent host, chat e Sessions comprendono rispettivamente 2.447, 1.488 e 1.038 file TypeScript, inclusi i loro test. Rimuovere registrazioni isolate può lasciare dipendenze mancanti.

Il profilo essenziale dovrebbe conservare workbench, filesystem, persistenza, editor, Extension Host, terminale, Git e strumenti di linguaggio necessari agli adattatori. Le funzionalità opzionali dovrebbero avere entry point e dipendenze espliciti, con una build completa disponibile per confronti e aggiornamenti upstream.

## Ordine consigliato

1. Usare build e verifiche in fasi separate, già adottate nella CI M0. La CI desktop ignora i soli cambiamenti alla documentazione, evitando di ripetere installazioni e build per registrare gli esiti.
2. Misurare il controllo di produzione separato dai test e mantenere i test pertinenti alle modifiche.
3. Introdurre un profilo di installazione/build senza l’estensione Copilot upstream, mantenendo il profilo completo.
4. Misurare tempi, memoria e dimensioni del risultato; successivamente valutare la separazione degli altri servizi opzionali.
