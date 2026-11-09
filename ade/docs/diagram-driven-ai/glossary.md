<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# Lessico normativo DAI v1

Adottato in DAI-01 sulla baseline `05c3a0f0`. Questo lessico definisce il significato obiettivo; non aggiunge campi allo schema v3. Il [registro di copertura](coverage.json) distingue i significati già rappresentabili da quelli da implementare.

| Termine | Significato e confine |
| --- | --- |
| Sistema governato | Soggetto progettato e mantenuto dal progetto, con identità e confine espliciti. La cartella Git non ne definisce da sola il confine. |
| Sistema esterno | Dipendenza dichiarata oltre il confine governato. ADE descrive integrazione, contratto ed evidenza disponibili; non attribuisce al progetto il suo codice interno. |
| Attore/persona | Ruolo umano o soggetto autorizzato che interagisce con il sistema; non coincide con un componente applicativo. |
| Container C4 | Unità applicativa eseguibile/distribuibile oppure unità di memorizzazione, con responsabilità e tecnologia risolta nel PSM. Più istanze non implicano più identità progettuali. |
| Unità distribuibile | Unità che il profilo può costruire/installare/eseguire o predisporre come store. Una libreria collegata a un'applicazione non diventa un container solo perché ha una cartella. |
| Immagine Docker | Artefatto versionato di distribuzione, eventualmente usato da un container C4. Un container C4 può non usare Docker; immagine e unità progettuale hanno identità differenti. |
| Componente | Responsabilità interna a un container, con interfacce fornite/richieste e un owner architetturale esplicito. Non equivale automaticamente a una classe, file o directory. |
| Modulo/libreria | Unità riusabile di organizzazione/implementazione senza distribuibilità autonoma presunta. Può essere condivisa con binding espliciti; non duplicarne i contratti per ogni consumer. |
| Feature | Capacità di business trasversale. Può coinvolgere più componenti/container; la membership di feature non trasferisce ownership architetturale. |
| Ownership | Responsabilità architetturale univoca al livello pertinente. L'appartenenza a una feature e il raggruppamento visuale sono relazioni distinte. `parentId` v3 non prova che questa separazione esista già. |
| Vista/diagramma | Proiezione con scope e riferimenti a identità condivise. Coordinate, selezione, filtri e zoom non creano nuove definizioni di dominio. Ordine di messaggi e annidamento di frame sono invece semantica. |
| Intento | Specifica accettata di responsabilità, contratti, comportamenti e vincoli. Il modello governa questo intento; una modifica esterna non lo sostituisce automaticamente. |
| Implementazione | Sorgenti, configurazione e artefatti che realizzano l'intento su una piattaforma. Un cambiamento del corpo senza nuova firma può modificarne il comportamento. |
| Evidenza | Informazione con origine e revisione: estrazione di un parser, interpretazione IA, risultato di un test o traccia osservata. Ogni tipo ha una forza probatoria distinta. |
| PIM | Modello di responsabilità e regole di business indipendenti dalla piattaforma. Deve conservare identità e criteri durante un cambio stack. |
| PSM/profilo/archetipo | Scelte tecnologiche, binding, capacità e runner fidati versionati che rendono generabile un target. Un profilo di parsing M4 non è un archetipo di generazione. |
| Contratto/operazione | Definizione condivisa di tipi, input, risultato, errori, permessi, effetti e criteri. Le operazioni referenziabili richiedono ID stabili, anche per overload. |
| Occorrenza | Singolo uso di un'operazione in un'interazione, con propri ID, argomenti e risultato. Chiamare due volte la stessa operazione non duplica il contratto. |
| ADR del progetto | Decisione dell'utente con storia, scope e vincoli normativi. Gli ADR in `ade/docs/decisions` riguardano lo sviluppo di ADE e non sono automaticamente vincoli dei progetti utente. |
| Target | Sottografo e archetipo cui si riferiscono impatto, readiness, contesto e generazione. Una bozza indipendente non blocca target estranei. |
| Provenienza | `authored`: dichiarazione progettuale; `extracted`: fatto estratto con strumento; `inferred`: interpretazione proposta; `observed`: esito di esecuzione. Produttore e revisione restano associati. |
| Accettato | Intento o decisione approvata nel progetto. Non significa testato, implementato o osservato in produzione. |
| Verificato | Esito di un controllo identificato, su input/revisione identificati, con evidenza disponibile. Una revisione diversa richiede invalidazione pertinente. |
| Ignoto | Valore necessario ma non conosciuto; richiede chiarimento o blocca il target. Non è un valore predefinito plausibile. |
| Omesso | Dato escluso da una proiezione/trasporto con motivo dichiarato; non prova che sia assente nel dominio. Un'omissione essenziale blocca il task. |
| Vuoto/null/false | Valori distinti: una collezione vuota è conosciuta, `null` è un valore ammesso solo dal relativo tipo, `false` è un booleano noto. Un campo mancante non equivale a nessuno di questi. Il `null` obbligatorio di un provider è convertito dall'adattatore. |
| `draft` | Specifica salvabile e recuperabile, anche incompleta. Le lacune restano visibili. |
| `structurallyValid` | Superamento di schema, riferimenti e invarianti pertinenti. Non dimostra generabilità o comportamento. |
| `generationReady` | Sufficienza calcolata per target/archetipo, con tecnologie, dipendenze e vincoli risolti. Non dimostra che il codice generato supererà i test. |
| Stato operativo | Preparazione, chiarimenti, proposta, review, verifica, applicazione, fallimento, annullamento o superamento. È distinto dalla maturità della specifica. |
| Allineato | Nessuna divergenza rilevata sul dominio confrontabile della baseline comune. Non certifica equivalenza comportamentale completa. |

Le prove usano etichette separate: **locale deterministica**, **provider simulato**, **risposta registrata**, **inferenza live**, **integrazione runtime**, **desktop/accessibilità**. Una simulazione del modello descrive semantica; una traccia osservata descrive una reale esecuzione. Byte UTF-8, offset UTF-16, token stimati, usage dichiarato dal provider e prezzo non sono unità intercambiabili.
