<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. See License.txt in the project root for license information. -->

# Handoff DAI-08 → DAI-09

Scheda §10, 9 novembre 2026 (Europe/Rome). Branch `work`, HEAD `05c3a0f0`; DAI-01–08 sono modifiche locali senza commit/push/PR. Conservare lavoro e report storici.

1. **Requisiti/comportamento:** prossimo sprint DAI-09, completare S13 sul primo profilo. Prima: reverse verificato di predicati, piani interazione/stato e sole policy retry messaging. Dopo: matrice per costrutto, operazioni fisiche create/rename/move/delete, conflitti e recupero espliciti, zero loop di eco.
2. **Riuso:** leggere [messaggistica v1](messaging-v1.md), [verbale DAI-08](dai-08.md), [ADR 0011](../decisions/0011-jetstream-messaging.md), stati/interazioni e journal DAI-05. Riutilizzare lock, snapshot, worktree, pre/postimmagini e source hashes; non creare un secondo journal.
3. **Decisioni:** Node ESM profilo revisione 5, NATS JetStream 2.11.9/client 2.29.3, adapter broker locale separato dal runner di progetto. D04 primo broker chiuso, secondo archetipo ancora DAI-11. Cambiare semantica/profilo invalida review precedenti.
4. **Scope/preservazione:** conservare identità, ADR, contratti, coordinate, annotazioni e codice fuori regioni. Reverse arbitrario o ambiguo produce mapping parziale/conflitto. La pubblicazione di file non migra broker, ledger, checkpoint o dati vivi. Nessuna outbox/transazione/exactly-once implicita.
5. **Contesto/budget:** contesto contract-first con policy e consumer condivisi, closure esplicite, fonti fisiche e sigilli. Budget 192 KiB/64 KiB immutabili, overflow bloccante, usage ignoto null. Conservare il risultato negativo del grande pack evidence-only.
6. **Attesi indipendenti:** fissare prima degli adapter modifiche corpo a firma invariata, rename/move/delete, risorsa mancante, collisione/ambiguità, ADR violato, conflitto stessa guardia/policy, indice perso, cambio manuale prima dell'undo e no-op senza riscritture/chiamate IA. Regressioni broker reali separate dalla simulazione; binario esatto obbligatorio, niente skip o mock come prova di rete.
7. **Recovery/esecuzione:** iniettare arresti prima/durante/dopo commit logico e invalidare prove dopo modifica degli input. Nessun codice utente arbitrario nel runner, Node permission non è sandbox OS. Prove native iniettate e Chromium non equivalgono a desktop completo. R01–R16 rimangono aperti fino alle accettazioni finali.
