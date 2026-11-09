<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# DAI-09 · Attesi indipendenti

9 novembre 2026 (Europe/Rome). Criteri derivati dall'[handoff fissato in DAI-08](handoff-dai-09.md), concretizzati nei test di riconciliazione. Gli attesi sono percorsi, identità, pre/postimmagini, permessi ed esiti dichiarati; non sono prodotti dall'interprete.

| Caso | Atteso |
| --- | --- |
| F01 | Ogni tipo di artefatto attraversa create, move in sottocartelle, rename esterno, reverse, delete esplicito e undo; ID, testo fuori regione e permessi rimangono esatti. I test generati funzionano anche nel nuovo percorso |
| F02 | Destinazione occupata, identità duplicata e nuovo sorgente dopo review bloccano prima della pubblicazione |
| F03 | Traversal e symlink annidati non diventano scope di scrittura |
| R01 | Modifiche al piano a firma invariata sono riconosciute solo nel sottoinsieme dichiarato; layout, annotazioni e contratti restano conservati. Fonte mancante per interazioni/stati/messaging è mapping parziale |
| R02 | Modifiche alle risorse o al runtime fuori grammatica restano parziali, senza riscrivere modello o ADR |
| C01 | Cambi concorrenti a contratto, decisione, piattaforma o policy producono conflitto esplicito |
| J01 | Arresto prima, durante o dopo il commit logico di un move produce coppia originale o nuova coerente; l'indice perso viene ricostruito dalle fonti finali |
| J02 | Cambio manuale ai permessi prima dell'undo viene conservato e blocca l'operazione; fatti del parser non diventano intenzioni di modello |
| J03 | Snapshot autorevole perso blocca; ricostruire una cache non ricrea una baseline |
| I01 | Indice derivato troppo grande: blocco prima della scrittura, cache precedente e sorgenti conservati |
| N01 | Sync immediato forward/reverse allineato: zero proposte, zero riscritture sorgenti/cache, zero chiamate IA |

Le prove storiche del journal includono anche undo interrotto, modifiche manuali durante recovery, revisione superata e oracolo indipendente negativo. Il nuovo indice non sostituisce queste verifiche e non introduce un secondo journal.
