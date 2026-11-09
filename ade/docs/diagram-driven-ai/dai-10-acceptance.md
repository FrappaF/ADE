<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# DAI-10 · Attesi indipendenti

Fissati prima dell'implementazione il 9 novembre 2026 (Europe/Rome). Il collaudo usa input di business e dialoghi nativi; non considera un test Chromium equivalente al desktop completo.

| Ambito | Vedere | Creare | Modificare / prova attesa |
| --- | --- | --- | --- |
| L1 | Scope e integrazioni | Sistema, attore, dipendenza | Responsabilità e confine; stessa identità |
| L2 | Container, tecnologia, canali | Unità e connessioni | Ruolo, binding, protocollo e payload |
| L3 | Owner, porte, librerie | Componenti e interfacce | Ownership e consumer condivisi |
| L4 | Tipi, firme, vincoli | Contratti e operazioni | Errori, campi, criteri e impatto |
| Sequenze | Ordine, annidamenti e guardie | Occorrenze e sei frame | Spostamento da tastiera, espressioni tipizzate |
| Stati | Owner, eventi e azioni | Macchina, stati e trigger | Entry/exit/do, priorità ed errori |
| Messaggi | Producer, queue/topic e schema | Canali e subscription | Retry, consegna e idempotenza |
| ADR | Scope, stato, storia e vincoli | Record e vincoli | Revisione conserva decisione precedente |
| Operazioni | Piano leggibile e verifiche | Intento e chiarimento | Nuova revisione persistita; conflitto esplicito; ritorno al diagramma |

- Un checkout e un caso asincrono si modificano tramite dialoghi di produzione senza editing JSON o sorgenti; annullare un dialogo non muta il modello.
- Chiarimenti persistono domanda, risposta, revisione e storia nel documento; undo/redo e riapertura li conservano. Il contesto usa l'intento corrente.
- Le diagnostiche di generabilità aprono il relativo editor. Proprietà mostrano maturità derivata, owner, ignoti e provenienza; nessun flag manuale sostituisce la readiness.
- Lettura accessibile, controlli da tastiera, ripristino focus, tema chiaro/scuro/alto contrasto e viewport stretta conservano informazioni e azioni. Simulazione e pubblicazione hanno etichette distinte.
- Continuità spenta di default, opt-in esplicito per progetto con limite preventivo dei job e sola preparazione locale. Nessun provider è necessario per il profilo deterministico; chiamate IA osservate sempre zero. Review, verifiche e pubblicazione restano esplicite.
- Modifiche ravvicinate producono un solo job corrente; un risultato superato viene scartato anche se ignora la cancellazione. Stop/progetto diverso/dispose annullano il job. Budget esaurito e fallimenti non producono retry incontrollati; ripresa conserva consumo.
- Selezione, layout, zoom, formattazione, documenti incompleti e target allineati non avviano inferenze. Limiti di contesto 192 KiB e riserva output 64 KiB; overflow blocca, usage ignoto resta null.
- Le review superate non consentono pubblicazione; lock, journal e recovery rimangono condivisi. Le prove di arresto/recovery esistenti restano obbligatorie per le modifiche al relativo protocollo.
