<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# DAI-03 · Input e attesi indipendenti

Registrati prima dell'implementazione del blueprint, 9 novembre 2026. Il corpus v1 e il budget v1 restano congelati; questi casi aggiungono verifiche strutturali, senza sostituire gli oracoli di business.

| Caso | Input | Atteso |
| --- | --- | --- |
| B01 | Shop governato, persona, Payments esterno dichiarato, API e store, checkout e audit con libreria condivisa | L1 → L2 → L3 → L4, ID invariati, modulo unico |
| B02 | Componente di store incluso in L3 API senza dichiarazione di contesto | Diagnostica scope; con contesto esplicito visibile senza ownership API |
| B03 | Integrazione con Payments senza dichiarazione L1 | Readiness bloccata, nessuna inferenza |
| B04 | Porta richiesta senza fornitore o collegata a porta non fornita | Diagnostica localizzata sul consumer |
| B05 | Parametro richiesto stringa, fornitore integer; risultato nullable per consumer non nullable | Firma incompatibile; presenza opzionale e nullabilità confrontate separatamente |
| B06 | Operazione, tipo o errore referenziato assente | Bozza salvabile, contesto bloccato |
| B07 | Operazioni omonime con firme diverse e ID distinti | Overload ammesso; duplicazione della stessa firma respinta |
| B08 | Rinomina operazione/tipo e riuso in più feature | Nessuna nuova identità; proiezioni aggiornate, consumer impattati |
| B09 | ADR Accepted vincola protocollo/tecnologia, proposta contraria | Proposta respinta; ADR conflittuali bloccano senza precedenza |
| B10 | ADR Proposed, Deprecated, Superseded o fuori scope | Consultabile; nessun vincolo attivo né record nel payload del target |
| B11 | Revisione ADR Accepted e sostituzione | Storia conservata, revisione obsoleta respinta, contesto precedente invalido |
| B12 | Pacchetto del contratto con tipi ricorsivi e ADR applicabili | Chiusura completa, byte reali e sigillo; oltre budget blocco esplicito |
| B13 | Comandi guidati C4, tipi/operazioni/porte, ownership, membership, binding, asserzioni e ADR | Annullamento senza scritture; transazione unica, undo/save/reopen con ID stabili |

Il profilo di test non è uno stack produttivo. Condizioni testuali restano descrittive fino a S05; nessun test strutturale certifica esecuzione dell'applicazione.
