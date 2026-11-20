# A.D.E — Agentice Development Environment

ADE è un ambiente di sviluppo desktop basato su Code OSS. Puoi progettare un sistema con diagrammi, definire contratti e casi di verifica, esplorare una codebase esistente e usare l’IA per preparare modifiche da rivedere e applicare.

## Primo avvio

Per compilare e avviare ADE da un clone, installa Git, Python 3, un compilatore C/C++ e le dipendenze native del sistema. I passaggi per macOS, Linux e Windows sono nella [guida di sviluppo](ade/docs/fork-development.md).

Su macOS e Linux, con `nvm` installato, esegui questi comandi dalla radice del clone.

```sh
nvm install
nvm use
npm run ade:setup
./ade/scripts/dev.sh
```

`ade:setup` usa la versione Node fissata in [`.nvmrc`](.nvmrc), installa le dipendenze e prepara l’app desktop. Il primo avvio può scaricare le estensioni integrate. Usa una cartella di lavoro separata dal clone per i tuoi progetti.

## Prova con un progetto di esempio

1. Estrai i [progetti di esempio](ade/docs/guida-utente/progetti-esempio.zip) in una cartella in cui puoi scrivere, conservando i file nascosti.
2. In ADE scegli **Open Project** e seleziona `01-bottega-visuale` per esplorare acquisto e resi.
3. Segui la [guida utente](ade/docs/guida-utente/README.md) per costruire un modello da zero, provare le verifiche locali o importare `08-mercato-codebase` con **Import Codebase**.

La modellazione e gli esercizi locali si possono fare senza un account IA. La guida descrive i prerequisiti dei flussi assistiti e le differenze tra generazione da modello, aggiornamento del codice esistente e Sync.

## Documentazione

- [Guida utente](ade/docs/guida-utente/README.md) · [PDF](ade/docs/guida-utente/Guida-ADE.pdf) · [HTML offline](ade/docs/guida-utente/Guida-ADE.html)
- [Sviluppo da sorgente](ade/docs/fork-development.md) e [architettura](ade/docs/architecture.md)
- [Come contribuire](CONTRIBUTING.md) e [segnalazioni di sicurezza](SECURITY.md)

ADE deriva da [Code OSS](https://github.com/microsoft/vscode). La revisione di origine è registrata in [`ade/upstream.json`](ade/upstream.json). Consulta la [licenza MIT](LICENSE.txt) e gli [avvisi di terze parti](ThirdPartyNotices.txt).
