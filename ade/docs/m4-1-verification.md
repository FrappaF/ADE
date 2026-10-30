# Verifica M4.1 — Importazione sintattica multilinguaggio

Data: 30 ottobre 2026. Base: `main` aggiornata a `deb0f0f3`; sviluppo in `feat/m4-code-bridge`. Ambiente: Linux x64, Node 24.22.1 selezionato dalla versione richiesta in `.nvmrc`. Questo verbale riguarda il tool Node e la compatibilità del modello generato, senza dichiarare chiusa M4 o le verifiche desktop M2/M3.

## Risultati

| Verifica | Esito osservato |
| --- | --- |
| Installazione isolata `ade/code-import` con lockfile e script disabilitati | Superata; nessuna dipendenza aggiunta al renderer o alla radice |
| `npm --prefix ade/code-import run check` | Typecheck mirato superato, incluso il contratto semantico consumato dal tool |
| `npm --prefix ade/code-import test` | 20 test superati, comprendenti 14 profili linguistici |
| `node --test ade/test/*.test.mjs` | 59 test del dominio esistente superati |
| `node --check ade/code-import/cli.mjs` | Superato |
| `git diff --check` | Superato |
| Importazione dell'esempio poliglotta e riapertura con `readSemanticModel` | Superata: 3 file, 7 dichiarazioni, 13 elementi, 3 diagrammi e 10 mappature; nessuna diagnostica nel campione |

Le fixture coprono JavaScript, TypeScript, TSX, Python, Java, C#, C, C++, Go, Rust, PHP, Ruby, Swift e Dart. Verificano estrazione di dichiarazioni reali, classificazione, evidenze, compatibilità M1/M3 e segnalazione delle chiamate non risolte. Altri casi coprono import, interfacce e firme, arrow function, contenimento, offset con Unicode, identità dopo modifica di firma/formattazione, revisioni cambiate, nomi uguali in file/progetti distinti, overload, nomi calcolati, sorgenti malformati, linguaggi senza adattatore, file grandi, esclusioni e link simbolici. La CLI viene verificata in sottoprocessi: modello/indice salvati, sovrascrittura rifiutata, output nel sorgente rifiutato anche attraverso un link simbolico, sorgenti invariati.

L'importazione diretta del piccolo esempio ha impiegato circa 49 ms in una singola esecuzione locale: è un controllo di funzionamento, non un benchmark rappresentativo, una soglia di prestazione o un confronto con un modello IA. Le grammatiche sono locali dopo l'installazione; l'importazione non chiama provider o servizi remoti.

Il sandbox del cloud blocca con `EPERM` i sottoprocessi Node: i runner dei test sono stati eseguiti con il permesso necessario, mantenendo invariati i test. La versione Node iniziale dell'ambiente era 24.19.0; i risultati sopra sono stati ottenuti con 24.22.1. Il tentativo iniziale di installazione root è stato interrotto; per questo incremento basta l'installazione separata del tool, senza toolchain Electron.

## Limiti e prosecuzione

La copertura è sintattica e circoscritta ai profili documentati nella [guida](code-import.md). Chiamate e dipendenze non vengono risolte, non sono generate relazioni per somiglianza di nomi, non è dedotto comportamento runtime e non sono attribuite feature. Kotlin/Scala e altri formati restano riconoscibili come non supportati, invece di essere interpretati come TypeScript. Gli ID non sono ancora riconciliati dopo rinomine/spostamenti; l'esecuzione rianalizza i file e non costituisce Sync incrementale.

Il modello prodotto supera lo stesso lettore/validatore di dominio del prodotto. L'apertura manuale del modello generato sul desktop, il percorso di importazione dalla home, la navigazione diretta al sorgente, macOS/Windows e la CI remota non sono stati collaudati in questa sessione. `ci.yml` aggiunge un job dedicato per installazione, typecheck e test del tool; la sua presenza non certifica un'esecuzione GitHub riuscita. Nessun contributo UI è stato modificato.

I successivi incrementi M4 devono aggiungere configurazione del perimetro, adattatori semantici verificati per linguaggio, indice/diagnostiche e navigazione nel workbench, cache, Sync e riconoscimento conservativo delle rinomine. L'IA e il relativo benchmark rimangono in M5, come richiesto nella revisione di [ADR 0003](decisions/0003-code-import-sync-and-providers.md).
