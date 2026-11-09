<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# DAI-04 · Predicati, profilo e contesto strutturale

Consegnato il 9 novembre 2026 nel perimetro I2 iniziale: prima S05, primo S10 e S11 per task strutturali. HEAD `05c3a0f0`, branch `work`; DAI-01/02/03/04 restano modifiche locali non integrate. [Attesi indipendenti](dai-04-acceptance.md), [contratto](context-v1.md), [copertura](coverage.json) e [handoff DAI-05](handoff-dai-05.md) delimitano la consegna; tutte le accettazioni di release R01–R16 restano aperte.

| Criterio | Consegna e prova |
| --- | --- |
| DAI-04.1 · Espressioni iniziali | AST versionata opzionale in v4, type checker, scope input/output, riferimenti a campi, letterali nominali, confronti/logica, presenza/null, interprete deterministico ed emissione ESM. Casi limite indipendenti su assenza, null, segno e safe integer, negazioni per denaro/quantità, variabili fuori scope, cicli/operatori sconosciuti. [ADR 0006](../decisions/0006-portable-predicates-v1.md) |
| DAI-04.2 · Primo archetipo | Registro fidato `node.esm` v1, Node 24.22.1 ESM senza framework, capacità/versioni, mapping e convenzioni, dipendenze vuote, runner fidato dichiarato. Test di descrittore falsificato, toolchain superata e capacità mancanti. Binding PSM separati dal PIM. [ADR 0007](../decisions/0007-node-esm-structural-profile.md) |
| DAI-04.3 · Selezione e serializzazione | Chiusura per operazione con tipi/guardie/errori/chiamate, contratti richiesti, owner/consumer consultivi, ADR, mapping e provenienza. Cento operazioni indipendenti non modificano i byte della feature; cicli di tipi senza duplicazione, ordine delle occorrenze conservato. Libreria comune compact-v4 e conteggio riusati da M5, importazione e M6 |
| DAI-04.4 · Pacchetto completo | Baseline pertinente, progetto/versioni, dizionario, focus/delta/prima-dopo opzionale, definizioni, confini, vincoli, evidenze sigillate, lacune, scritture, schema output e budget. Byte canonici identici su layout e modifiche indipendenti; dipendenze obbligatorie oltre budget bloccanti |
| DAI-04.5 · Budget/protocollo/cache | Envelope intero misurato, output minimo 64 KiB e overhead esplicito; stima distinta da token/prezzo non misurati. Esiti `proposal/needsClarification/needContext/unsupported`, retrieval entro scope, nuova disclosure/sigillo e intento versionato. Cache con ricontrollo e zero chiamate |
| DAI-04.6 · Proposte e workbench | Candidato su copia, schema/ID/temp keys, scope, ownership, tipi, ADR, criteri/evidenze, ancore/revisioni/freschezza. Lettore sorgente M5 riutilizzato con ricontrollo prima della proposta. Editor guidato guardie, binding e anteprima focusabile con JSON esatto, lacune e costo sconosciuto; salvataggio/undo/riapertura nativi e lettura accessibile |

## Verifiche osservate

| Livello | Esito |
| --- | --- |
| `node --test ade/test/*.test.mjs` | 167 test passati, inclusi 27 casi nuovi di task/predicati; corpus e budget congelati |
| `npm --prefix ade/ai test` | 35 test passati; Ajv2020 strict indipendente su modello, AST ed esiti; sorgenti reali stale/symlink respinti |
| `npm --prefix ade/code-import test` | 169 test passati, senza abilitare riscritture legacy v4 |
| Mocha sorgenti: servizio, blueprint, predicati, lettura, dialoghi comportamento | 67 test passati; text model/undo e filesystem in memoria reali, dialoghi scriptati al confine |
| Chromium 154.0.8037.57 con Playwright, renderer di produzione | 7 test passati: quattro blueprint precedenti e tre nuovi su anteprima, guardia/lettura e markup ostile |
| Tipi e schema | Check package IA/import e diagnostiche mirate TypeScript su file workbench/test riusciti; schema v4 rigenerato con v2/v3 identici; `git diff --check` riuscito |

Totale: **445 test passati**, zero fallimenti/skip nelle suite dichiarate. Il [registro verifiche](../benchmarks/dai-04-verification-2026-11-09.json) lega esiti e sorgenti correnti. Il renderer usa DOM/Chromium reali, senza DOM simulato; non è un collaudo completo Electron, temi, screen reader o percorso nuovo progetto → runtime. Le prove di predicati eseguono soltanto il modulo puro emesso dai template fidati, senza inferenza o applicazione di codice di progetto.

## Economia misurata

Il [pacchetto registrato](../benchmarks/dai-04-sealed-context.json) della fixture `dai-node-orders` contiene **26707 byte UTF-8**, con grammatica/schema/istruzioni inclusi. Il [confronto sullo stesso input](../benchmarks/dai-04-context-2026-11-09.json) misura 45835 byte nel percorso di definizioni precedente: riduzione del **41,7%**. Con cento operazioni indipendenti aggiunte alla stessa libreria, il percorso precedente misura 124582 byte e quello nuovo resta identico, inclusi sigillo e byte. L'oracolo delle definizioni obbligatorie è esplicito nei test; non è una misura di recall su repository arbitrari. Nessun risparmio di token o prezzo è dichiarato come osservato.

Il [benchmark sui grafi congelati](../benchmarks/dai-04-2026-11-09.json) mantiene input/soglie v1. Il grafo grande delle sole evidenze continua a superare 192 KiB; il task completo oltre budget viene bloccato senza troncamenti né aumento delle soglie. Misure di latenza e RSS restano locali e separate dal timing desktop.

## Limiti e seguito

Il profilo supporta contesto strutturale e predicati puri. Creazione progetto, analisi/reverse, forward produttivi e runner di progetto isolati appartengono a DAI-05; storage, frame eseguibili, stati, asincronia e migrazioni restano non supportati. Il profilo dichiara quei limiti e gli adapter M4–M6 conservano i guard v4.

Il compilatore produce il contratto S11 strutturale e gli adapter condivisi, senza invocare provider. Il coordinatore DAI-05 dovrà collegare baseline/delta, disclosure e identità ai job/snapshot/worktree reali prima della pubblicazione. La libreria pura non legge filesystem: l'adapter sorgente è l'autorità sulle revisioni effettive. La readiness conserva prudenza su alcune bozze nello stesso componente, evitando falsi claim di selezione minima universale. Nessun live provider, broker, deployment o accettazione completa R01–R16 è certificato da questa consegna.
