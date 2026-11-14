# Editor persistente M2.2

La prima implementazione consente di creare un sistema dai diagrammi. Il modello resta intento progettuale: creare un'azione o una condizione non genera codice e non esegue verifiche.

## Percorso di progettazione

1. Dalla home scegliere **Create Project**, assegnare un nome e scegliere la cartella di destinazione. A.D.E crea `.ade/model.json` senza sovrascrivere un progetto già esistente. **Open Project** riapre il progetto contenuto nella cartella; **Open Model** conserva l'accesso ai documenti storici e agli esempi.
2. Scegliere **Add Feature**. Un'unica operazione crea la feature, il diagramma strutturale e quello di flusso, entrambi inizialmente vuoti. Nella sidebar sono disponibili aggiunta, rinomina e cancellazione dei diagrammi e gestione delle feature.
3. Con **Add Element** inserire attori, interfacce, componenti, risorse, controller, contratti, azioni e stati. Gli stati richiedono la scelta della risorsa cui appartengono. **Add Existing Element** mostra lo stesso elemento in un altro diagramma, conservandone l'identità. Per includere anche un collegamento già esistente in una vista ordinaria, aggiungere entrambi gli estremi e usare **Diagram > Contents > Add Existing Relationship**. L'azione conserva la relazione condivisa e modifica soltanto la vista, con Undo disponibile. Sequence e State mantengono i rispettivi comandi Add Existing Message e Add Existing Transition.
4. Selezionare l'origine e scegliere **Connect Selection**. La palette propone tipi e destinazioni compatibili; nome e condizione vengono conservati nel modello. Le condizioni sono testo dichiarativo, comprese le alternative «pagamento autorizzato» e «pagamento rifiutato». Le proprietà permettono rinomina, descrizione, modifica delle condizioni e cancellazione dei collegamenti.
5. Spostare i nodi trascinandoli o usando le frecce quando un nodo ha il focus; Shift aumenta il passo. Sono disponibili zoom, **Fit Diagram**, scorrimento con pulsante centrale o Alt+trascinamento e disposizione automatica a griglia. Anche lo sfondo del canvas riceve il focus da tastiera: le frecce scorrono la vista senza spostare gli elementi. Le coordinate sono locali al diagramma e vengono salvate; zoom e scorrimento della sessione non fanno parte della semantica.
6. Usare **Save** o la scorciatoia nativa di salvataggio. Undo/redo sono disponibili da pulsanti, menu e scorciatoie del workbench. Riaprire il progetto conserva elementi, proprietà, relazioni, diagramma attivo e selezione.

L'[esempio progettato v3](../examples/checkout-designed.ade.json) contiene struttura, flusso, una prima sequenza e il ciclo di vita dell'ordine, incluse le due alternative dichiarate di pagamento. Non contiene mappature o verifiche inventate. Nelle sequenze M3.4 i partecipanti si ordinano dalle proprietà anziché trascinare i nodi; i messaggi riusano le relazioni e si ordinano soltanto nella vista. Nelle viste di stato M3.5, Add State e Add Existing Transition lavorano sulle risorse rappresentate; una tabella affianca il canvas e le rimozioni dalla sola vista conservano il sistema. Il sottoinsieme supportato è descritto nell'[esploratore semantico](semantic-explorer.md).

La revisione M2.3 mantiene salvataggio, cronologia, aggiunta di elementi e controllo della vista in primo piano. **Project Options** raccoglie ricaricamento e salvataggio di una copia; **Diagram Options** contiene gestione del diagramma, disposizione e inserimento di elementi esistenti; **Feature Options** nella sidebar contiene la gestione della feature. Le sezioni sono apribili con Invio o Spazio e conservano l'apertura durante gli aggiornamenti. Tutte le azioni restano disponibili nella palette comandi.

**Read Diagram** e il comando nativo **Open Accessible View** offrono la lettura testuale di elementi, relazioni, condizioni e proprietà senza aprire il JSON. **Open Accessibility Help** fornisce istruzioni contestuali con le scorciatoie effettive dell'utente. Il lettore segue gli aggiornamenti del documento ed Escape ripristina il focus sul controllo di origine; i dettagli sono nella [guida all'accessibilità](accessibility.md).

In una finestra stretta le proprietà passano sotto il canvas e lo scorrimento orizzontale resta nel diagramma. Selezionare un elemento conserva la posizione di lettura delle proprietà; scorrimento del canvas e del contenuto sono distinti per documento e diagramma durante la sessione. Il ripristino dopo un riavvio conserva il contesto semantico, non le posizioni di scorrimento.

## Documenti e recupero

Il servizio visuale risolve e mantiene un riferimento al modello documentale di `ITextFileService`/`ITextModelService`. Ogni modifica viene prima applicata a una copia, validata interamente e poi registrata come singola transazione nella cronologia nativa del testo. La creazione di una feature con i suoi due diagrammi è una sola operazione di undo. Sidebar e canvas leggono lo stesso documento.

L'input visuale espone stato modificato, salvataggio e ripristino al workbench. Il backend nativo conserva gestione di file in sola lettura, salvataggio, cronologia, backup delle modifiche non salvate, ripristino e conflitti con il disco. Il contenuto non salvato non viene sostituito da un caricamento visuale concorrente; cambiare documento con modifiche pendenti richiede una scelta esplicita fra salvataggio, scarto e annullamento.

Un errore di salvataggio resta visibile. Il documento può essere salvato con un'altra destinazione tramite **Save Project Copy**, oppure ricaricato da disco confermando lo scarto delle modifiche locali. La gestione dei conflitti segue le politiche native di salvataggio; il servizio visuale non richiede sovrascritture forzate. Se un aggiornamento esterno rende il documento invalido, il canvas precedente non viene presentato come stato corrente.

Il gestore `AdeWorkingCopyEditor` associa il documento testuale all'editor visuale. Il ripristino dei backup consulta anche le associazioni specializzate già registrate, così il gestore generico dei file può riutilizzare il canvas anziché aprire un secondo editor JSON per lo stesso documento. La modifica al core è indipendente dal dominio ADE e ha un test di regressione dedicato.

## Formato e compatibilità

I nuovi progetti usano lo [schema v3](../schema/model-v3.schema.json). L'unica estensione del contratto rispetto a v2 è `views[].featureId`, facoltativo e validato come riferimento a una feature. Questo mantiene il contesto anche quando il diagramma non contiene ancora nodi o mostra elementi condivisi.

I documenti v1/v2 rimangono apribili. La migrazione v1 conserva gli avvisi sulla classificazione incerta. Alla prima modifica visuale di un documento v2, `upgradeVisualModel` produce v3 con appartenenza esplicita per i diagrammi riconducibili a una sola feature; gli altri restano a livello di sistema. Identificatori, semantica, coordinate ed evidenze restano conservati. La conversione viene salvata solo con il documento ed è annullabile nella stessa cronologia della modifica. I client precedenti che supportano solo v2 rifiutano esplicitamente la versione 3.

## Cancellazione e perimetro

La cancellazione di un elemento mostra l'impatto su discendenti, relazioni, diagrammi, mappature, evidenze e riferimenti di autorizzazione. L'operazione rimuove i riferimenti coinvolti in tutte le viste ed è annullabile. Cancellare una feature rimuove anche i suoi diagrammi; cancellare un singolo diagramma conserva gli elementi semantici del sistema.

M2 introduce un primo editor strutturale e flussi di azioni con collegamenti condizionati. Gli incrementi M3 aggiungono ricerca, mappa, routing ortogonale, editing dei contratti comportamentali, sequenze coordinate e cicli di vita delle risorse con stati semplici: vedere l'[esploratore semantico](semantic-explorer.md) per capacità e limiti correnti. Notazione UML completa, stati compositi e semantica di esecuzione restano successivi. Importazione, generazione IA ed esecuzione appartengono alle rispettive milestone. La demo integrata resta in sola lettura; gli esempi aperti da file usano i normali servizi documentali.

Il collaudo Linux e i controlli automatici sono registrati nel [verbale M2.2](m2-2-verification.md). M2.3 completa revisione UX, accessibilità, temi, finestre strette e verifiche sulle piattaforme di destinazione.
