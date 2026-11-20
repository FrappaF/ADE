# A.D.E

**Progetta software con diagrammi, dai requisiti al codice.**

ADE è un IDE desktop basato su Code OSS. Le viste di un progetto condividono un modello, così puoi seguire la stessa risorsa dalla struttura del sistema alle interazioni e alle verifiche che la riguardano.

[Avvio rapido](#avvio-rapido) · [Prova un progetto](#prova-un-progetto) · [Guida utente](ade/docs/guida-utente/README.md) · [Issue](https://github.com/FrappaF/ADE/issues)

![IDE ADE con le feature Conferma acquisto e Resi e rimborsi nella barra laterale e il diagramma Struttura acquisto sul canvas](ade/docs/guida-utente/immagini/02-canvas.png)

*Bottega Ordini, il progetto di esempio del tour guidato.*

## Cosa puoi fare

- **Modellare un sistema da più prospettive.** Componi viste C4, UML, ERD e altri diagrammi riusando gli stessi elementi e riferimenti. Nel **Structural Blueprint** definisci tipi, contratti e decisioni architetturali.
- **Esplorare una codebase esistente.** Con **Import Codebase** ottieni un inventario locale e puoi risalire dalle evidenze ai file sorgente. La risoluzione semantica integrata copre JavaScript, TypeScript e TSX.
- **Verificare il comportamento.** Sui profili supportati puoi eseguire casi indipendenti e simulare interazioni, macchine a stati e consegna di messaggi.
- **Rivedere le proposte dell’IA.** Configura Codex o Claude Code per generare proposte di diagrammi dai sorgenti o preparare modifiche al codice dal modello. Consulta le fonti dei diagrammi e, per il codice, il diff e gli esiti delle verifiche prima di applicare le modifiche.

## Avvio rapido

ADE è in sviluppo e si compila dai sorgenti. Servono Git, Python 3, gli strumenti di compilazione nativi e la versione di Node.js fissata per il progetto. [Versione di Node.js](.nvmrc) · [Prerequisiti per macOS, Linux e Windows](ade/docs/fork-development.md#da-un-clone-pulito)

Su **macOS e Linux**, con `nvm` installato, esegui questi comandi.

```sh
git clone https://github.com/FrappaF/ADE.git
cd ADE
nvm install
nvm use
npm run ade:setup
./ade/scripts/dev.sh
```

Su **Windows**, seleziona la versione di Node.js indicata sopra ed esegui questi comandi da PowerShell dopo aver installato i prerequisiti.

```powershell
git clone https://github.com/FrappaF/ADE.git
cd ADE
npm run ade:setup
.\scripts\code.bat --user-data-dir .build\ade-profile --extensions-dir .build\ade-extensions
```

La prima preparazione scarica le dipendenze, compila il client e prepara Electron. Il tour, la modellazione manuale e l’inventario locale si possono usare senza configurare un provider IA.

## Prova un progetto

1. Estrai i [progetti di esempio](ade/docs/guida-utente/progetti-esempio.zip) fuori dal clone, conservando la cartella nascosta `.ade`.
2. Nella schermata iniziale scegli **Open Project** e seleziona `01-bottega-visuale`.
3. In **Struttura acquisto**, seleziona **Ordine** e usa **Rename** e **Save Changes** nelle proprietà. Apri **Struttura resi** per vedere il nuovo nome della stessa risorsa, poi usa **Undo** per ripristinarlo.

Puoi anche scegliere **Import Codebase** e selezionare `08-mercato-codebase` per seguire le evidenze dell’inventario fino ai sorgenti. [Istruzioni dell’esempio di importazione](ade/examples/guida/08-mercato-codebase/LEGGIMI.md)

## Documentazione

| Cosa cerchi | Dove iniziare |
| --- | --- |
| Esplorare l’IDE o costruire un modello da zero | [Guida utente](ade/docs/guida-utente/README.md) · [PDF](ade/docs/guida-utente/Guida-ADE.pdf) · [HTML offline](ade/docs/guida-utente/Guida-ADE.html) |
| Scegliere una notazione | [Atlante dei 16 diagrammi](ade/docs/guida-utente/README.md#parte-iii---atlante-dei-16-diagrammi) |
| Provare la generazione assistita | [Dai sorgenti ai diagrammi](ade/docs/guida-utente/README.md#l17-genera-i-diagrammi-di-acquisto-e-resi) · [Dai diagrammi al codice](ade/docs/guida-utente/README.md#l18-genera-il-primo-codice-dai-diagrammi) |
| Compilare, eseguire i test o orientarsi nel sorgente | [Guida di sviluppo](ade/docs/fork-development.md) · [Architettura](ade/docs/architecture.md) |

## Contribuire

Per segnalare un bug, proporre una funzionalità o aprire una pull request, consulta le [istruzioni per contribuire](CONTRIBUTING.md).

La CI desktop esegue i controlli su Linux e può includere macOS con un avvio manuale. [GitHub Actions](https://github.com/FrappaF/ADE/actions)

Per segnalazioni di vulnerabilità, segui la [procedura di sicurezza](SECURITY.md).

## Licenza e attribuzioni

ADE è distribuito con licenza [MIT](LICENSE.txt) e deriva da [Code OSS](https://github.com/microsoft/vscode). La revisione di origine è registrata in [`ade/upstream.json`](ade/upstream.json). Le attribuzioni delle dipendenze sono negli [avvisi di terze parti](ThirdPartyNotices.txt).
