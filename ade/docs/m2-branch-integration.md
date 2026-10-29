# Integrazione selettiva della branch M2 — 30 ottobre 2026

Origine: [`feat/m2-visual-workbench`, commit `bbfc20878977698fa278c2995800259e6915d25d`](https://github.com/FrappaF/ADE/commit/bbfc20878977698fa278c2995800259e6915d25d), un commit sopra la base comune `a8d677e9`. Il confronto è stato eseguito contro il workspace locale già avanzato a M3.2, comprese le modifiche non ancora registrate in commit. La selezione è applicata al workspace della branch locale `work`; la branch sorgente rimane intatta.

## Parti integrate

| Contributo della branch sorgente | Adattamento al workbench corrente |
| --- | --- |
| Gruppi nativi espandibili della sidebar | Sezioni sistema/feature con summary da tastiera; stato conservato separatamente per URI e identità del modello nello storage del workspace. Focus ed espansioni restano stabili durante aggiornamenti e riavvii. |
| Proiezione dei diagrammi sotto tutte le feature coinvolte | `getFeatureViews` segue i discendenti e include i diagrammi vuoti con proprietario esplicito. **Related Diagrams** espone riferimenti aggiuntivi; il proprietario v3 e il breadcrumb rimangono invariati. |
| Evitare ricostruzioni della sidebar a ogni selezione | Aggiornamenti basati su versione del documento e destinazione; selezionare un nodo conserva i controlli della sidebar. Modifiche al documento, errori, caricamento, configurazione e keybinding aggiornano ancora la vista. |
| Esempio «Annullamento acquisto» | Aggiunti `cancellation`, `cancel-controller`, le due relazioni e `cancellation-structure`, mantenendo identità e layout dei percorsi acquisto, pagamento e carrello già presenti. JSON e sorgente dell'esempio restano equivalenti. |
| Etichette dei tipi e diagnostica separata | Tipi Structure/Activity/Sequence/State nel contesto del diagramma e nel lettore; tipo del nodo nella descrizione accessibile. Riutilizzato `adeDiagnostics.ts`, eliminando la funzione duplicata dal servizio. |
| Ritorno al diagramma da tastiera | `Ctrl+Alt+D` su Windows/Linux, `Cmd+Alt+D` su macOS apre **Return to Model**, conservando anche mappa e schede M3. L'identificatore storico `ade.returnToDiagram` è un alias del comando corrente. |
| Persistenza del servizio M2.1 | Le chiavi storiche `ade.visual.home` e `ade.visual.context` sono fallback per ripristinare diagramma e selezioni compatibili nei profili della branch. Le chiavi correnti hanno precedenza; dati malformati vengono ignorati. |
| Verbale macOS della branch | Conservato in [m2-validation.md](m2-validation.md), con provenienza e ambito della revisione originale. |

## Parti già coperte o mantenute nella versione corrente

La sidebar predefinita, i servizi nativi per apertura degli editor, i watcher correlati e il profilo portable dello smoke erano già presenti. Il contesto portable corrente scrive già in `portable/user-data` e abilita il dialogo integrato; la correzione della branch non richiedeva ulteriori modifiche.

Si conservano `AdeProjectService`, il backend testuale nativo, undo/redo, conflitti e recupero M2.2, schema v3, ricerca, schede, mappa, cronologia, accessibilità e router M3.2. Il servizio in sola lettura e i widget alternativi della branch duplicano questi componenti e non sono aggiunti come secondo percorso di stato. La selezione di un elemento fuori dal diagramma continua a raggiungere una scheda reale anziché diventare una selezione invisibile del canvas.

L'ottimizzazione della selezione nel canvas della branch assume che il riferimento al modello resti stabile. Il nostro servizio restituisce snapshot separati e il renderer coordina anche cronologia, editing e geometria delle etichette; quella scorciatoia non viene copiata nel canvas. La parte applicabile è integrata nella sidebar, usando la versione del documento e verificando la conservazione del DOM nel desktop. Il router ortogonale corrente conserva frecce, etichette e segnalazione degli ostacoli anziché adottare le curve prive di etichette della prima shell.

## Verifica della revisione integrata

Esito locale Linux: superati 63 test automatici, controlli statici e tutti e tre i percorsi Electron descritti di seguito.

- 34 test di dominio: include il nuovo percorso di annullamento, appartenenza per discendenza, riferimenti condivisi, diagrammi vuoti con proprietario e indipendenza dalla geometria.
- 29 casi del runner nativo, compreso il controllo degli errori inattesi: aggiunti migrazione del profilo della branch, precedenza delle chiavi correnti e recupero da dati storici malformati.
- Typecheck ADE, ESLint mirato, Stylelint, build client e controllo della sintassi dello smoke. Controllo architetturale mirato su 21 file non di test, senza violazioni.
- `--navigation-only`: selezione senza ricostruzione della sidebar, percorso annullamento e ritorno alla selezione precedente; summary con Enter/Space, isolamento fra demo e file con gli stessi ID, persistenza dopo il riavvio; un diagramma condiviso aperto dalla feature correlata conserva il breadcrumb del proprietario. Rimane compreso il percorso M3.1/M3.2. Schermata: `.build/ade-smoke/integrated-m2-sidebar.png`.
- `--ux-only`: aiuto e lettura accessibile, quattro temi, mappa e diagramma in finestra stretta, Fit Diagram, focus e scorrimento; ritorno al modello dal terminale usando la scorciatoia integrata.
- `--native-only`: regressioni di creazione, editing, salvataggio, annullamento, conflitti, copia e recupero del documento.

Le prove correnti si svolgono su Linux x64 con Node 24.22.1, Electron 43.8.3 e Xvfb. Il [verbale macOS importato](m2-validation.md) riguarda la shell M2.1 sorgente; la revisione integrata M2.2/M3, VoiceOver e CI remota richiedono ancora il proprio collaudo. Importazione del codice, IA e Sync restano nelle milestone già previste. Il prossimo incremento della roadmap rimane M3.3.

Prima dell’integrazione è stata conservata una copia dei 56 file locali modificati o non tracciati in `.build/ade-integration-backups/before-m2-*.tar.gz`, insieme alla differenza Git iniziale. La differenza selettiva rispetto a quella copia è disponibile in `.build/ade-integration-backups/m2-selective-integration.patch`. Questi artefatti locali consentono di isolare questa integrazione dal precedente lavoro non ancora registrato in commit.
