<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# Handoff DAI-09 → DAI-10

Scheda §10, 9 novembre 2026 (Europe/Rome). Branch `work`, HEAD `05c3a0f0`; DAI-01–09 sono modifiche locali senza commit/push/PR. Conservare il lavoro e i report storici.

1. **Requisiti/comportamento:** prossimo DAI-10, completare S14 e modalità continua opt-in S12. Prima: comandi espliciti, editor e review per costrutto. Dopo: percorso visuale/accessibile completo, chiarimenti versionati, automazione con budget e cancellazione dei job superati.
2. **Riuso:** leggere [round trip](roundtrip-v1.md), [verbale DAI-09](dai-09.md), [ADR 0012](../decisions/0012-structural-roundtrip-and-source-index.md), editor/criteri e journal esistenti. Riutilizzare lo stack nativo di undo, QuickInput, diagnostiche e servizi del workbench.
3. **Decisioni:** Node ESM revisione 5, broker locale separato, nessuna nuova semantica runtime in DAI-09. Secondo archetipo DAI-11. Matrice per costrutto esposta in projectCoverage; non dichiarare reverse arbitrario o ricostruzione di ADR/contratti da codice.
4. **Scope/preservazione:** ID, layout, annotazioni, codice fuori regioni e permessi conservati. Move/rename anche annidati; delete richiede modello valido. Indice derivato ricostruibile; snapshot autorevole perso blocca. Nessuna pubblicazione file migra dati vivi.
5. **Contesto/budget:** mantenere 192 KiB/64 KiB, overflow bloccante, usage ignoto null. No-op zero proposte, riscritture sorgenti e chiamate IA; cache persa può essere ricostruita. Inventario sigillato invalida prove dopo variazioni delle fonti.
6. **Attesi indipendenti:** fissare prima della nuova UI matrice vedere/creare/modificare per L1–L4, frame, stati, messaggi e ADR; focus/tastiera, finestra stretta, temi e percorso senza JSON. Provare coalescing, cancellazione, assenza di provider, budget esaurito e opt-in spento. Non contare prove iniettate o Chromium come desktop completo.
7. **Recovery/esecuzione:** riusare lock/journal e pre/postimmagini; interrompere prima/durante/dopo commit e invalidare review superate. Test broker reali separati dalla simulazione; DAI-09 non cambia adapter broker. R01–R16 restano aperti fino all'accettazione finale.
