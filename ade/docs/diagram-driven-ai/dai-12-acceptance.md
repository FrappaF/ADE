<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# DAI-12 · Contratto di collaudo

Definito prima delle nuove misure, 9 novembre 2026. Corpus `corpus.v1.json` e budget `budgets.v1.json` restano congelati. Una verifica locale riuscita non chiude automaticamente I5.

| Criterio | Osservazione richiesta | Esito bloccante |
| --- | --- | --- |
| Corpus | Una riga per ciascun caso e profilo, input e attesi indipendenti; confronto dell'intera osservazione | Caso senza adapter, non eseguito o fallito mantiene la release aperta |
| Due runtime | Verifica reale Node 24.22.1 e Bun 1.3.2, stessi criteri, round trip e recupero | Runtime assente/versione diversa, nessun fallback |
| Contesto | Baseline e candidato sulle stesse fixture; recall degli oggetti obbligatori, byte, duplicati, latenza e riserve | Lacuna essenziale, overflow silenzioso, economia senza correttezza |
| Incrementalità | No-op/layout, cache, cicli, retrieval e invalidazione misurati separatamente | Chiamata o scrittura estranea |
| Integrazioni | Broker reale distinto dalla simulazione; journal e dati conservati | Perdita dati o attestazione di transazioni non implementate |
| Provider | Tre prove per caso/candidato con provider, modello, prompt/schema, usage e prezzi disponibili | Credenziali assenti: non misurato, nessun risultato inventato |
| Desktop | Due percorsi nativi, tastiera/screen reader, scala e piattaforme pertinenti | Chromium isolato non certifica Electron/macOS |
| Riproduzione | Comandi locali, report legati a hash dei sorgenti, esito per R01–R16 e S00–S15 | Report incompleto, storico presentato come prova della revisione attuale |
| Pubblicazione | Tutti gli incrementi DAI in branch separata per prove locali | Nessun merge/deploy implicito |

Negativi: schema/ID/ownership, scope, ADR, protocolli, contratti, retrieval, budget e freschezza; usare le API produttive, mai una funzione che restituisce l'atteso. Una categoria normalizzata deve essere accompagnata dal diagnostico grezzo. Capability unsupported rimane aperta anche quando il rifiuto preventivo funziona.
