<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# DAI-05 · Primo progetto puro e pubblicazione governata

Consegna del 9 novembre 2026 (Europe/Rome), branch `work`, HEAD `05c3a0f0`. DAI-01–05 sono modifiche locali, senza commit, push o pull request. [Contratto](project-v1.md), [attesi pre-implementazione](dai-05-acceptance.md), [ADR 0008](../decisions/0008-pure-project-runner-and-publication.md) e [handoff DAI-06](handoff-dai-06.md) delimitano il risultato.

Il progetto può nascere senza codice importato o chat precedente, ottenere un binding Node ESM esplicito e una feature pura di verifica della quantità, produrre un piano in worktree e pubblicare la coppia modello/codice solo dopo review e verifiche indipendenti. Il profilo revisione 2 abilita creazione, analisi, forward e reverse nel sottoinsieme dei predicati. Un contratto di operazione rimane una specifica: non viene trasformato arbitrariamente in un corpo eseguibile dalla sola prosa.

Il modello si aggiorna subito con i comandi visuali. Una modifica semantica invalida la review; i target allineati e il solo layout producono zero inferenze. Ogni sessione collega contesto DAI-04, baseline reale, mapping, sorgenti e criteri revisionati. Il piano comprende manifest, sorgenti ESM e test derivati, con creazioni/modifiche/cancellazioni e permessi. Criteri indipendenti, codice estraneo e ADR non vengono riscritti dal generatore.

Il runner esegue il codice reale riemesso dal dominio e harness fidati, con controllo sintattico, Node permission, env vuoto, deadline e output limitato. I test indipendenti sono separati dai test derivati. La [prova persistita sul modello `dai-node-orders`](../benchmarks/dai-05-project-2026-11-09.json) contiene contesto esatto, sigillo, piano, 8 casi derivati e 8 indipendenti verdi. Dopo una modifica visuale `gt → ge`, i casi derivati passano ma quello indipendente sullo zero fallisce; la pubblicazione è bloccata. Il secondo job sul progetto allineato non produce proposta e conta zero chiamate IA.

Reverse verifica l'intera regione eseguibile e riconosce confronti/letterali del template; i soli metadati non certificano il corpo. Rename/move conservano le identità e richiedono un mapping univoco. Delete è esplicito; codice non riconosciuto produce mapping parziale, cambiamenti concorrenti producono conflitto. Layout, prosa e codice fuori regione restano conservati. Le pre/postimmagini fisiche includono assenza e permessi, estendendo il lettore/journal comune M5/M6. La pubblicazione attiva la baseline solo dopo tutte le scritture; recovery riconosce il commit oppure ripristina le preimmagini, proteggendo modifiche manuali. I guard condivisi bloccano nuove pubblicazioni durante un'interruzione.

**528 test verdi** nei perimetri dichiarati, riepilogati con hash delle sorgenti nel [report di verifica](../benchmarks/dai-05-verification-2026-11-09.json):

| Perimetro | Esito |
|---|---:|
| Dominio, migrazioni, schema, CLI e contesto | 167 |
| Motore IA, vecchi flussi e nuovo progetto puro | 62, di cui 27 del progetto |
| Importazione/Sync/SCIP/riconciliazione legacy | 169 |
| Documenti e orchestrazione nativa con servizi iniettati, editor e lettura accessibile | 123 |
| Renderer reali in Chromium | 7 |

Type check di `ade/ai` e `ade/code-import`, diagnostiche mirate dei file workbench modificati, bundle del motore nativo, controlli sintattici e `git diff --check` sono parte della verifica. I mock dell'orchestrazione non sostituiscono il runner: la suite del progetto usa veri filesystem, repository Git, worktree e processi Node. I casi negativi coprono revisione superata, criteri, sorgenti, manifest, permessi, worktree, metadati forgiati, dipendenze nuove, symlink, modifiche manuali, confronto concorrente, delete e arresti di pubblicazione/undo prima e dopo il commit logico. La CLI viene provata dall'inizializzazione all'undo con processi reali.

Il [benchmark v4](../benchmarks/dai-05-2026-11-09.json) conserva grafi, corpus e budget v1; latenze di validazione/edit/impact/packing e memoria rimangono entro soglia. Il pack di sole evidenze del grafo grande resta 284875 byte contro il limite 196608: il fallimento è conservato e non è un task sigillato del primo progetto. Nessuna soglia è stata aumentata; la misura della preparazione del progetto comprende Git e filesystem e non viene equiparata alla latenza del solo compilatore di contesto.

Restano espliciti i limiti: nessun corpo arbitrario di operazione, frame/stato/broker, storage o migrazione DB runtime, continuità o secondo stack; nessuna inferenza live, misura di token o prezzo; nessun collaudo desktop completo o sandbox OS/firewall certificati. Codice e test personalizzati fuori regione sono conservati ed esclusi dal runner. La migrazione DB provata è un artefatto con precondizioni, strategia dati e recupero, mai eseguito o distribuito automaticamente. S12/S13 proseguono sulle capacità future e tutte le accettazioni R01–R16 restano aperte; il prossimo sprint è DAI-06, interazioni e frame eseguibili.
