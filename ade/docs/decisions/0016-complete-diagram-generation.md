<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# ADR 0016 — Generazione completa con review unica

Data: 10 novembre 2026. Evoluzione di [ADR 0015](0015-incremental-diagram-exploration.md).

## Decisione

Il percorso desktop predefinito pianifica l'insieme dei diagrammi rilevanti, prepara le viste dalla panoramica ai dettagli e chiede una sola approvazione finale. La pianificazione e i singoli passi non richiedono conferme intermedie. Il catalogo restituito da `ade_project_inspect` descrive le notazioni e i loro requisiti; `ade_diagram_plan` registra un grafo limitato di obiettivi, gerarchia e dipendenze. Non viene richiesta una vista per ogni notazione disponibile.

Le transazioni di bozza restano piccole, con una vista per passo, evidenze versionate e identità riservate. Nelle sessioni `workflow: project`, i passi successivi leggono il modello temporaneo ottenuto applicando le bozze valide precedenti. Le correzioni con `supersedes` conservano posizione e ID; i consumatori incompatibili restano da correggere. Il modello pubblicato non viene modificato durante la generazione.

La review finale aggrega piano, esclusioni motivate, diff e anteprime. La sua identità copre revisione del modello, piano, task e contenuto effettivo delle proposte. `publishAll` ricontrolla l'identità revisionata, evidenze, letture/scritture, geometria e completezza del piano, poi usa un solo snapshot e il journal di riconciliazione esistente. Una bozza invalida o un conflitto impediscono l'applicazione complessiva. Le esclusioni esplicite rimangono nel piano e nei dati della sessione; le relative bozze non vengono applicate.

Il bridge del worker passa alla versione 6 per rilevare build desktop incompatibili con le nuove operazioni di review e pubblicazione complessiva. Le sessioni v2 rimangono leggibili con i campi opzionali del nuovo flusso.

Gli strumenti dell'agente non espongono l'azione di pubblicazione. Il workbench conserva l'ultima conferma umana. Gli adapter CLI e chat nativa usano gli stessi servizi e lo stesso catalogo. Le sessioni indipendenti esistenti e il percorso legacy rimangono leggibili; riprendere la generazione dal desktop promuove la sessione al flusso completo, mantenendo le bozze.

## Budget e limiti

Il piano contiene al massimo 40 viste. Le nuove generazioni dispongono di 400 chiamate locali, 8 MiB restituiti, 90 minuti e 32 turni osservabili. L'esaurimento conserva il lavoro e richiede una ripresa o un aumento esplicito del budget; non consente un'applicazione parziale implicita. Il conteggio non certifica le inferenze interne del provider. Le viste di stato descrittive restano non supportate e le lacune delle evidenze non vengono completate inventando comportamenti.

## Verifica

I test di servizio coprono dipendenze fra viste di notazioni diverse, una sola pubblicazione, retry, ripresa, correzioni, conflitti, esclusioni e modifiche successive alla review. Un test sul bundle avvia il server MCP effettivamente indicato dal worker. I test del browser verificano l'accesso alla review complessiva dalla Home importata e l'azione finale. Queste prove non sostituiscono la valutazione della qualità dei diagrammi prodotti da un modello reale su repository diversi.
