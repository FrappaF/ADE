# CI e consumo GitHub Actions

La CI automatica esegue i controlli leggeri e la suite desktop completa su Linux per le pull request e i push su `main`. I push sugli altri branch non avviano workflow: aprire una PR per validarli. Nuovi commit annullano l'esecuzione precedente dello stesso workflow, evento e PR/branch. Una PR e il successivo merge su `main` restano verifiche separate: il merge può produrre una revisione diversa.

I cambiamenti limitati a Markdown o `ade/docs/` non avviano la CI. I controlli leggeri comprendono setup, prototipo, dominio, importazione e collaborazione IA. Il desktop conserva typecheck, test dei servizi, build delle estensioni e tutti gli smoke test, inclusa la regressione dei test manuali. Non esegue chiamate IA reali.

## Verificare macOS

Da **Actions → ADE desktop → Run workflow**, selezionare il branch e lasciare attivo **Run the complete macOS suite alongside Linux** (`include_macos`). Il workflow esegue la stessa suite completa su `ubuntu-24.04` e `macos-15` arm64. Disattivare l'opzione per un avvio manuale soltanto Linux. Eseguire la verifica macOS prima delle release e per modifiche a dipendenze native, integrazioni di piattaforma o aggiornamenti upstream. Il successo automatico su Linux non certifica macOS; VoiceOver resta un collaudo distinto.

Per avviare manualmente i soli controlli leggeri, scegliere **Validate ADE domain and prototype → Run workflow**.

## Cache e artifact

`setup-node` conserva la cache npm dei download, con chiavi basate sui lockfile: tutti i package per il desktop, importatore e IA per il job leggero. Ogni esecuzione continua a usare `npm ci` e gli script di installazione previsti; i moduli nativi vengono preparati per la piattaforma corrente. La cache non contiene `node_modules` o output compilati.

Il desktop riusa l'azione locale `setup-electron`, che conserva gli archivi di download per sistema, architettura, configurazione e checksum, quindi prepara e verifica Electron anche quando la cache è disponibile. Gli artifact degli smoke vengono caricati anche in caso di errore e conservati per **3 giorni**, senza ricomprimere le immagini. Scaricare le evidenze utili prima della scadenza. I job leggeri hanno timeout di 10 e 15 minuti; il desktop mantiene il limite di 60 minuti.

## Misura di partenza

La [run desktop 42071211285](https://github.com/FrappaF/ADE/actions/runs/42071211285), sul commit della PR #12 del 5 novembre 2026, impiega circa **27 minuti su Linux** e **10 minuti su macOS**. Su Linux, `npm ci` occupa circa **8 minuti e 53 secondi**, mentre gli smoke nativi occupano circa **13 minuti e 30 secondi**. Sono durate osservate nei log, non minuti fatturati: l'addebito dipende dal piano e dal runner.

Portare macOS all'avvio manuale elimina circa 10 minuti di esecuzione runner automatica per una run analoga, prima di considerare la tariffazione. La cache riduce i download ripetuti, ma il guadagno effettivo richiede una misura dopo il primo popolamento e non elimina compilazione nativa o smoke. La CI leggera evita inoltre il doppio avvio push/PR sui branch di sviluppo. Per riduzioni ulteriori servono un profilo di installazione desktop più piccolo o una selezione degli smoke basata sulle dipendenze; questi interventi richiedono verifiche separate.
