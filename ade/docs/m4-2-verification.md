# Verifica M4.2 — Stato e Sync sintattico incrementale

Data: 30 ottobre 2026. Base: `a29b58c3` (M4.1); branch `feat/m4-code-bridge`. Ambiente: Linux x64, Node 24.22.1 dalla versione richiesta in `.nvmrc`. Il tool resta separato dal desktop e funziona senza IA.

## Risultati osservati

| Verifica | Esito |
| --- | --- |
| `npm --prefix ade/code-import run check` | Superato; typecheck del tool e dei moduli di dominio consumati |
| `node --check ade/code-import/cli.mjs` | Superato |
| `npm --prefix ade/code-import test` | 30 test superati: i 20 precedenti più 10 scenari per cache, Sync, stato e recupero |
| `git diff --check` | Superato |
| Prova locale su 140 file in 14 profili | Una modifica Python causa un solo parsing; 139 estrazioni riusate |

Le nuove verifiche coprono riuso su tutti i profili linguistici, modifica del contratto TypeScript con testo completo aggiornato, cancellazione di una classe, spostamento di file senza rianalisi, spostamenti ripetuti fra cartelle e una successiva modifica del simbolo spostato. Il riutilizzo del percorso originale genera nuove identità e non si sovrappone al modulo spostato. Copie e corrispondenze multiple non vengono scambiate per rinomine certe.

Il confronto con il modello salvato conserva annotazioni, relazioni manuali, posizioni e nodi nascosti compatibili. I test verificano anche assenza di cambiamenti nel modello in un Sync senza modifiche, aggiunta di nuovi nodi, collisioni con identità manuali, cancellazioni di elementi annotati e riferimenti divenuti invalidi. Questi ultimi casi restituiscono conflitti senza modello applicabile. L'impatto preliminare include un componente manuale collegato al contratto modificato e riusa la logica M3.

Snapshot e CLI sono verificati tramite file e sottoprocessi reali: baseline separata dal modello modificabile, checksum di stato/indice, validazione JSON Schema e dominio, manifest e chiavi sorgenti coerenti, rifiuto di snapshot incompleti o mescolati, sorgente cambiato prima della pubblicazione, modello precedente salvato dopo la lettura, annullamento e mantenimento dei byte della versione precedente. `status` non crea directory; `sync` produce una nuova cartella e un report, mentre un conflitto termina con codice `2` senza pubblicare una nuova versione. I controlli M4.1 su sovrascritture e destinazioni nel sorgente restano superati.

La prova di carico ha usato dieci copie delle quattordici fixture: circa 953 ms per l'importazione iniziale e 234 ms per la rianalisi dopo una modifica, con altri controlli in esecuzione nello stesso ambiente. Sono misure singole su sorgenti piccoli, influenzate anche dal caricamento delle grammatiche; non costituiscono soglie di prodotto o un confronto con modelli IA. La proprietà verificata è il parsing di un file e il riuso degli altri 139. Tutti i sorgenti supportati vengono comunque letti per verificare gli hash; la pubblicazione ricontrolla il manifest.

I runner Node sono stati eseguiti con il permesso richiesto dal sandbox per i sottoprocessi. È stata aggiornata soltanto l'installazione separata del tool, per aggiungere Ajv con versione e dipendenze fissate nel lockfile; nessuna dipendenza del renderer o toolchain Electron è stata modificata. Il job CI già presente esegue automaticamente la nuova suite, ma non è stata osservata una nuova esecuzione remota in questa sessione.

## Confini della consegna

Questo è Sync sintattico via Node verso snapshot distinti; non è ancora il pulsante Sync del workbench. La risoluzione semantica di import/chiamate e la relativa invalidazione delle dipendenze, la configurazione del perimetro, Kotlin/Scala, le rinomine dei simboli e gli spostamenti con modifiche restano incrementi successivi di M4. Gli ID non vengono abbinati con inferenze o somiglianze. Sorgenti parziali, overload modificati e spostamenti ambigui bloccano l'aggiornamento per evitare di trasferire annotazioni a identità incerte.

Il modello generato è verificato con il contratto del prodotto; non sono stati eseguiti build/smoke Electron, nuove verifiche manuali del desktop, macOS/Windows o CI remota. I moduli del dominio e la UI non sono stati modificati. La verifica di freschezza è ottimistica e il marcatore rileva salvataggi incompleti: non equivale a un blocco degli editor concorrenti o alla durabilità dopo perdita di alimentazione. La [guida](code-import.md) precisa comandi, limiti e recupero. La riconciliazione bidirezionale resta in M6; l'IA in M5.
