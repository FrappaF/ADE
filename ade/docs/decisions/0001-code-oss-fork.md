# ADR 0001 — A.D.E come fork dei sorgenti Code OSS

Stato: adottata su richiesta dell'utente, 28 ottobre 2026.

## Decisione

A.D.E usa i sorgenti Code OSS nella radice della repository e può modificare direttamente il workbench e l'applicazione desktop. L'estensione sperimentale resta in `ade/prototype/` come banco di prova, mentre l'ambiente visuale definitivo sarà integrato nel prodotto.

## Motivazione

La progettazione attraverso diagrammi e la navigazione semantica devono diventare l'esperienza principale. Il controllo diretto del workbench permette di intervenire su layout iniziale, comandi, pannelli, navigazione e integrazione dei servizi.

## Conseguenze

Il progetto deve mantenere build desktop, branding, aggiornamenti upstream e compatibilità. La sincronizzazione modello/codice e il coordinamento IA restano servizi da progettare con confini chiari. Conservare il motore dell'editor testuale per gli adattatori e gli strumenti interni, anche quando l'esperienza principale è visuale.

L'importazione iniziale mantiene la storia ADE e registra lo snapshot Microsoft senza incorporarne tutta la storia. La relazione di fork mostrata da GitHub non viene modificata. Build desktop, icone, firma e distribuzione restano incompleti.

Aggiornamento del 28 ottobre 2026: build e smoke desktop sul MacBook sono stati successivamente confermati dall'utente, come registrato nel [verbale M0](../m0-verification.md). L'[ADR 0002](0002-visual-workbench.md) precisa la riprogettazione dell'intero workbench e il percorso prioritario di progettazione di un nuovo sistema. Icone, firma e distribuzione restano nel perimetro M8.
