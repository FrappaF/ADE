# A.D.E — Agentice Development Environment

A.D.E è un progetto per un ambiente di sviluppo basato su VS Code in cui il software engineer lavora su **struttura, diagrammi, flussi e interazioni fra attori e sistema**, collaborando con l'IA per realizzare il codice e gestire i dettagli dei framework.

L'obiettivo è esplorare e modificare feature, risorse, viste e controller senza dover leggere il codice, mantenendo **diagrammi e codebase sincronizzati in entrambe le direzioni**.

## Stato del progetto

Prototipo iniziale: un'estensione VS Code legge un modello JSON, ne valida gli elementi e mostra un diagramma strutturale aggiornato durante la modifica del documento. Editing visuale, collaborazione con IA e sincronizzazione con la codebase sono ancora da implementare.

## Prova locale

Servono VS Code e Node.js >= 22. Non sono necessarie dipendenze npm.

1. Apri questa cartella in VS Code e premi **F5 → Avvia A.D.E**.
2. Nella finestra di sviluppo esegui **A.D.E: Apri modello visuale** dalla palette comandi.
3. Seleziona `examples/checkout.diagram.json` e modifica il JSON per aggiornare la vista.

Controlli: `npm run check` e `npm test`.

## Documentazione

- [Visione di prodotto](docs/vision.md)
- [Roadmap e milestone](docs/roadmap.md)
- [Architettura](docs/architecture.md)

Repository: [FrappaF/ADE](https://github.com/FrappaF/ADE). Licenza di distribuzione ancora da definire.
