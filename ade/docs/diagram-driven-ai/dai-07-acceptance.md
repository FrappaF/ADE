<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# Attesi indipendenti DAI-07

Fissati prima dell'emettitore, 9 novembre 2026. Dominio checkout: stato iniziale Draft, pagamento positivo → Paid, annullamento → Cancelled finale. Un controllo interno lascia Draft; refresh esterno su Draft esegue exit ed entry. Il campo amount è nominale Money, gli eventi condividono i contratti del blueprint.

| Caso | Atteso indipendente |
|---|---|
| V01 | Zero o due iniziali, finale con transizioni, stato irraggiungibile, owner errato, gerarchia o regione ortogonale: generazione bloccata. |
| V02 | Evento/azione/guardia non tipizzati, ref stale, transizione interna fra stati diversi: bloccati. |
| T01 | pay positivo: guard → do cancel/drain → Draft exit → charge → Paid entry → commit Paid → do start. |
| T02 | Due guardie vere a pari priorità: ambiguousTransition, Draft, nessuna azione. Priorità diversa sceglie la maggiore. |
| T03 | Payload assente/null/errato non diventa false; typeError o indeterminateGuard, nessun avanzamento. |
| T04 | Evento inatteso/finale: rejected, nessun effetto. Stesso ID e payload già accettato: duplicate. Stesso ID con payload diverso: deliveryConflict. |
| T05 | Transizione interna: solo effetto, nessuna exit/entry/cancellazione do. Auto-transizione esterna: tutte le fasi. |
| T06 | charge fallisce: failed, stato Draft, nessuna entry Paid; istanza bloccata anche dopo riapertura. |
| T07 | do completata: completed; do pendente interrotta da transizione esterna: cancelled con drain; do fallita: istanza bloccata. |
| P01 | Due eventi concorrenti vengono copiati e serializzati per istanza; ordine di invio mantenuto, istanze indipendenti. |
| P02 | Checkpoint quiescente scritto e riaperto: stato e dedup persistono, entry/do non rieseguite. Checkpoint alterato/stale/pending rifiutato. |
| R01 | Interprete ed ESM emesso concordano con attesi scritti separatamente; errore intenzionale nel piano passa i derivati ma fallisce gli indipendenti. |
| R02 | Progetto reale: stage, verify Node, publish, aligned, reverse verificato, stale review, undo e crash condividono il journal DAI-05. |
| U01 | Editing nativo atomico/cancellabile, guardia via builder condiviso, lettura accessibile e simulazione spiegabile senza provider. |
