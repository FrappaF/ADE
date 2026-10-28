# A.D.E — Agentic Development Environment

## Base del prodotto

A.D.E viene sviluppato come fork dei sorgenti Code OSS, con controllo diretto del workbench, della navigazione e dell’applicazione desktop.

## Visione di prodotto

Il software engineer esprime cosa deve fare il software e come deve essere organizzato attraverso struttura, diagrammi, flussi, vincoli e interazioni fra attori e macchina. L'IA collabora con lui per trasformare questo progetto in software funzionante, mantenendo allineati implementazione e rappresentazioni visuali.

Il codice e il framework diventano dettagli implementativi gestiti dall'ambiente. Le scelte tecniche restano ispezionabili e configurabili quando influenzano costi, prestazioni, sicurezza o distribuzione; la progettazione ordinaria deve poter avvenire senza aprire file sorgente.

## Esperienza attesa

Il developer parte dalla mappa del sistema e può approfondire ogni feature, risorsa, vista e controller. Ogni elemento espone responsabilità, comportamenti, input e output, dipendenze, dati, autorizzazioni, errori e verifiche. Da una funzione si attraversano le sue interazioni con gli attori, i flussi, le risorse utilizzate e i componenti che la implementano, mantenendo il contesto di navigazione.

Le viste comprendono struttura e UML, flussi e attività, sequenze di interazione, stati, dati, interfacce e contratti. Sono prospettive coordinate dello stesso sistema. Una vista visuale deve distinguere quanto è progettato, quanto è implementato e quanto è stato verificato.

Esempio: selezionando «Conferma acquisto» si esplorano schermata, validazioni, pagamento, creazione dell'ordine, errori e test. Il developer aggiunge un percorso per il pagamento rifiutato; l'IA propone la relativa implementazione e le verifiche. Una modifica successiva al servizio pagamenti viene rilevata e riconciliata con le viste coinvolte.

## Collaborazione con l'IA

L'IA usa modello, vincoli, codebase e risultati delle verifiche per proporre un piano e realizzare modifiche. Le richieste ambigue diventano domande sul comportamento del sistema. Le modifiche mostrano impatto funzionale e architetturale, esiti dei test e possibilità di ripristino. Le decisioni del developer rimangono tracciate.

## Sincronizzazione bidirezionale

Ogni modifica al modello deve produrre un aggiornamento coerente dell'implementazione; ogni modifica alla codebase deve aggiornare le rappresentazioni interessate. È un requisito del prodotto finale, non una capacità già presente.

L'allineamento deve distinguere intenti progettuali, struttura osservata del codice e comportamento verificato in esecuzione. Dove una trasformazione non è univoca, A.D.E espone il conflitto e chiede una decisione sul modello. Non deve dichiarare sincronizzata una modifica soltanto perché è stato generato del codice.

## Criteri di successo

- Creare e modificare una feature completa dall'interfaccia visuale.
- Esplorare feature, risorse, viste e controller senza leggere codice.
- Riconciliare modifiche provenienti sia dai diagrammi sia dalla codebase.
- Verificare il comportamento e presentare errori nel contesto del modello.
- Conservare modifiche manuali, cronologia e decisioni progettuali.
- Sostituire un adattatore tecnologico mantenendo gli intenti del modello, entro capacità dichiarate e verificate.

## Confine attuale

Il prototipo legge un JSON e ne visualizza elementi e relazioni. Editing visuale, agenti IA, navigazione semantica e sincronizzazione con il codice sono ancora da implementare.
