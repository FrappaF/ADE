<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# ADR 0005 · Vincoli normativi degli ADR dei progetti

Stato: adottata e attuata nel perimetro strutturale DAI-03. Data: 9 novembre 2026. Attua D06; questo documento riguarda lo sviluppo di ADE e non viene importato nei progetti utente.

Gli ADR dei progetti appartengono a `foundation.decisions`: ID e numero leggibile, revisione, titolo, contesto, decisione, conseguenze, scope esplicito e storia. Gli stati sono `proposed`, `accepted`, `deprecated`, `superseded`; `rejected` resta leggibile per compatibilità con DAI-02. La sostituzione richiede un riferimento a un altro ADR accettato. Il comando conserva lo snapshot precedente completo; un vecchio record normalizzato senza prosa conserva solo i dati effettivamente presenti.

Solo i vincoli correnti degli ADR accettati applicabili al sottografo necessario sono normativi. Owner, membership e dipendenze rendono applicabili gli scope pertinenti. Non esiste precedenza fra ADR globali/locali, né fra revisioni di ADR distinti. Lo stato `superseded` disattiva il predecessore senza cancellarne le ragioni. La storia non è un insieme aggiuntivo di vincoli attivi.

Il sottoinsieme verificabile usa categorie `technology`, `library`, `protocol`, `dependency`, `persistence`, `concurrency`, soggetti con namespace, proprietà JSON Pointer e valori scalari espliciti. `equals` impone un valore; `notEquals` lo vieta. Due uguaglianze diverse, oppure richiesta e divieto dello stesso valore, sono contraddittori. Proprietà o valori ignoti bloccano il target; l'assenza non soddisfa un divieto. Un vincolo sulla tecnologia può puntare a `/technology/value` del binding; protocollo e dipendenza puntano ai rispettivi oggetti del modello. Questa politica non interpreta automaticamente prosa, insiemi arbitrari, predicati o garanzie runtime.

Le trasformazioni dell'adapter devono soddisfare gli stessi controlli del dominio e conservare il registro delle decisioni. Non possono eludere una regola cancellando o modificando l'ADR nel risultato: l'utente prima lo revisiona con il comando tracciato, poi prepara un nuovo contesto. Una revisione documentale, un cambio di stato o di vincolo invalida il vecchio sigillo. Nessuna inferenza viene avviata dalle azioni di lettura, selezione, layout o editing.

Conseguenze: conflitti localizzati e verificabili, storia recuperabile con undo e file ordinari, contesto senza ADR inattivi o estranei. La prosa rimane soggetta a review; i profili S10 devono dichiarare le capacità effettive per implementare le regole di piattaforma. Le verifiche sono in [dai-blueprint.test.mjs](../../test/dai-blueprint.test.mjs), [diagram-driven.test.mjs](../../ai/test/diagram-driven.test.mjs) e nei test dei dialoghi e del servizio documentale.
