<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# Blueprint strutturale v4 · DAI-03

Estensione opzionale del [contratto v4](schema-v4.md). Gli input DAI-02 e gli esempi v2/v3 restano leggibili; nessuna apertura inventa tipi, scope, firme o ADR. I lettori che non conoscono i nuovi record devono rifiutarli senza riscrivere il file. Tipi, schema generato, regole di compatibilità e grammatica del contesto provengono dal dominio condiviso.

## Scope C4 e navigazione

Ogni vista C4 del blueprint dichiara `subjectId` e `contextIds`. L1/L2 hanno per soggetto un sistema governato, L3 un solo container, L4 (`class` con soggetto) una classe/interfaccia/contratto condiviso. Il soggetto è visibile; elementi fuori owner sono ammessi solo come contesto esplicito. `runtimeKind` distingue applicazione, servizio, web/mobile client, store e messaggistica; `description` dichiara la responsabilità. Le tecnologie sono nei binding PSM, non sono ricavate dal ruolo.

`getC4DrillDown` risolve le destinazioni per identità; breadcrumb e comandi **Open …** cambiano prospettiva senza modificare zoom o modello. Le interfacce del componente aprono il contratto condiviso; il sistema esterno non ha drill-down interno e non può essere target di implementazione. Un accesso esterno richiede sia l'integrazione consumer→sistema, sia il relativo contesto L1. Un nuovo fornitore richiede quindi un aggiornamento esplicito del blueprint.

## Registro condiviso

| Record | Contratto |
| --- | --- |
| `foundation.types` | `primitive`, `record`, `enum`, `collection`, `reference`; ID dei campi, vincoli minimum/maximum/pattern/minLength/maxLength. Record legacy senza `kind` restano conservati |
| `blueprint.operations` | ID, owner, nome, input, risultati, errori tipizzati con ID, autorizzazioni, effetti dichiarati, pre/postcondizioni descrittive e criteri di accettazione |
| `blueprint.interfaces` | Elemento contratto/interfaccia, versione, ID delle operazioni e invarianti descrittivi |
| `blueprint.ports` | Consumer/fornitore, interfaccia condivisa e direzione `required/provided` |
| `blueprint.connections` | Porta richiesta, porta fornita e mapping esplicito fra le operazioni |
| `blueprint.transports` | Relazione, protocollo, formato, tipo schema e versione del payload, come proprietà separate |
| `blueprint.modules` | Un package non distribuibile, consumer espliciti e binding libreria/versione conosciuti o irrisolti |
| `blueprint.fieldMappings` | Campo di dominio e campo fisico distinti, con destinazione `column/member`; il riferimento non li rende lo stesso oggetto |

`blueprint` è sotto `foundation`. Le operazioni non vengono copiate nei diagrammi; le occorrenze referenziano il loro ID e un eventuale `errorId`, che deve appartenere all'operazione chiamata. Gli overload hanno ID diversi e firme diverse. `required` indica presenza; `nullable` è conoscenza esplicita di un booleano. Un valore falso non è un campo sconosciuto o assente.

La compatibilità è conservativa: input dal consumer al provider, output dal provider al consumer; presenza e nullabilità sono confrontate separatamente. Il provider non può richiedere nuovi parametri obbligatori, produrre risultati più deboli, errori/effetti o permessi non dichiarati dal contratto richiesto. I tipi sono risolti ricorsivamente senza espandere cicli all'infinito; cicli fatti solo di alias non definiscono un tipo. Non si reinterpretano tipi legacy sconosciuti come primitive. L'implementazione delle condizioni testuali, dei frame e dei vincoli di piattaforma resta ai profili e agli sprint successivi.

## ADR ed editing

La [politica D06/ADR 0005](../decisions/0005-project-adr-constraints.md) definisce revisioni, stati, applicabilità e confronto dei vincoli. I campi aggiuntivi sono in `decisions[].record`, con snapshot delle revisioni precedenti. Le ragioni restano consultabili. Solo vincoli correnti accettati applicabili entrano nella valutazione; gli ADR inattivi o estranei non entrano nel pacchetto del target. Una proposta dell'adapter non può modificare il registro per eludere i controlli.

**A.D.E: Edit Structural Blueprint** apre dialoghi guidati per scope/viste, ownership, feature, integrazioni, binding, tipi, contratti, porte, trasporti, librerie, mapping e asserzioni. **A.D.E: Project Architecture Decisions** apre creazione, revisione, stato e vincoli ADR. Non richiedono JSON per questi record. Le scelte sono raccolte su copie e applicate in una sola transazione, protetta dalla revisione del documento; Cancel non scrive. Referenze temporaneamente incomplete restano bozze salvabili, con diagnostica e percorso di correzione. **Edit Model Specification** resta il percorso avanzato.

Proprietà, pannelli espandibili e **Read Diagram/Read Element** mostrano i metadati contrattuali e le motivazioni. `getContractImpact` include consumer e occorrenze; il normale impatto comprende porte, connessioni e librerie condivise. La firma modificata cambia il sigillo e può rendere incompatibili consumer e scenari, senza crearne una copia alternativa.

## Contesto e limiti

Il compilatore iniziale include le definizioni complete delle operazioni, tipi ricorsivi, errori, porte, connessioni, trasporti, moduli e ADR pertinenti. Lo schema del sottoinsieme è ricontrollato; dipendenze mancanti o byte oltre budget bloccano il task. I consumer di moduli condivisi sono inclusi conservativamente: questa chiusura non è ancora la selezione minima di S11. Geometria e selezione non cambiano il sigillo; soggetto/scope C4 sono parte della revisione semantica.

Il [checkout indipendente](../../examples/dai-blueprint.ade.json) dimostra due container, esterno dichiarato, più feature, package unico, contratto richiesto/fornito e ADR. `fixture.spec` serve solo alle prove. DAI-03 non sceglie uno stack, non registra generatori produttivi, non abilita Sync v4 e non certifica l'esecuzione delle dichiarazioni. S11/S14/S15, test desktop completi, generazione e round-trip proseguono negli sprint assegnati.
