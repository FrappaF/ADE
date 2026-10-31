# Collaborazione IA M5

M5 aggiunge un percorso dal contratto di una feature a un piano, modifiche isolate, test, applicazione e annullamento. Il primo stack eseguibile è JavaScript su Node.js, con test che usano i moduli integrati di Node. Le proposte possono descrivere altri linguaggi, ma questa versione non certifica un esecutore di test per ciascuno dei sedici profili di importazione M4.

Il [verbale M5](m5-verification.md) distingue implementazione, test con provider simulati e collaudo dei provider reali. Il codice non seleziona un modello economico senza misure e metadati confrontabili.

## Collegamento come in VS Code

La scelta segue la richiesta dell’utente del 30–31 ottobre 2026: login del provider e CLI originale dentro l’editor, senza richiedere una chiave API come percorso ordinario.

- **Codex:** quando l’SDK dell’Agent Host è disponibile con il profilo predefinito, il comando usa il servizio upstream `ICodexAccountService` e il suo login ChatGPT tramite app-server. Per un eseguibile esplicito o un profilo separato, apre `codex login` nel terminale integrato. Il browser e il callback rimangono responsabilità del provider originale.
- **Claude Code:** apre `claude auth login` nel terminale integrato; l’autenticazione segue il flusso Anthropic. Le credenziali e l’eventuale portachiavi restano gestiti da Claude Code.
- **CLI nell’editor:** il comando Open AI CLI apre il programma originale con il modello selezionato, nel worktree dell’operazione quando ancora in revisione oppure nel progetto corrente. È disponibile anche l’accesso alle chat native `agent-host-codex` e `agent-host-claude` del fork quando i rispettivi SDK sono configurati.

Installare la CLI ufficiale sul computer di sviluppo. Il selettore accetta il nome sul `PATH` o il percorso assoluto dell’eseguibile, utile anche per applicazioni macOS avviate dal Finder. Non installa estensioni Microsoft o pacchetti modificati e non estrae token dalle sessioni di altre applicazioni. Installazione, aggiornamento e condizioni d’uso rimangono quelli del provider. Le API dirette non sono il connettore di questo incremento.

Le [condizioni di Claude Code](https://code.claude.com/docs/en/legal-and-compliance), ricontrollate il 31 ottobre 2026, distinguono il login Claude.ai di un’applicazione terza dall’utente che autentica il binario originale con il proprio piano. Questo percorso usa il secondo caso: binario non modificato, flusso Anthropic e uso intestato direttamente all’utente. Non aggiunge un login OAuth Claude.ai di A.D.E e non intermedia credenziali o consumi. La distribuzione del prodotto deve rispettare le condizioni applicabili al provider.

Il catalogo usa soltanto i modelli dell’account nativo: i modelli instradati attraverso Copilot non sono trasferiti automaticamente alla CLI OpenAI/Anthropic. Gli ID Codex dell’Agent Host vengono decodificati prima dell’invocazione. Se il catalogo non è disponibile, si può indicare un ID esatto verificato nella CLI; disponibilità effettiva e quote sono controllate dal provider, e un errore non provoca un cambio automatico di modello.

Riferimenti consultati: [Codex nell’IDE](https://developers.openai.com/codex/ide), [Codex app-server e autenticazione](https://developers.openai.com/codex/app-server), [Claude Code in VS Code](https://code.claude.com/docs/en/vs-code). Nel fork, i riferimenti implementativi sono `codexAccountService.ts`, `agentSdkSetupService.ts`, `codexAgent.ts` e `claudeAgent.ts`. Gli adattatori strutturati usano `codex exec --output-schema` e `claude -p --json-schema`; i test di protocollo non sostituiscono il collaudo della versione installata di ogni CLI.

## Percorso dal modello

1. Importare con M4 la radice di un repository Git con almeno un commit e sorgenti senza modifiche pendenti. Disegnare o completare la feature e i suoi criteri di accettazione; salvare il modello. I metadati di lavoro sotto `.ade/` sono separati dalla baseline Git dei sorgenti.
2. Aprire AI Collaboration dagli strumenti A.D.E oppure il comando **A.D.E: Connect Claude Code or Codex**. Completare il login, scegliere modello, eseguibile e budget.
3. Avviare **Implement Feature**. Selezionare la feature e descrivere il cambiamento. I file suggeriti derivano da identità, mappature ed evidenze M4; la lista condivisa rimane esplicita e modificabile.
4. Rivedere il contesto prima dell’invio. Contiene intento, vincoli, elementi e contratti, relazioni, impatto, evidenze statiche, diagnostiche residue e il testo dei soli file selezionati. Il prodotto non aggiunge credenziali né la radice assoluta del progetto al messaggio; il testo sorgente rimane quello selezionato. Il filtro dei percorsi non è uno scanner dei segreti: l’anteprima definisce i dati che si sceglie di condividere.
5. Rivedere piano, file previsti e domande. Una domanda aperta interrompe la generazione: aggiornare intento o contratto con la risposta e preparare un nuovo piano. Il piano non certifica un’implementazione.
6. Approvare **Generate in Worktree**. Il prodotto crea un worktree Git separato, riceve sostituzioni strutturate e verifica percorsi, hash di base, identità e riferimenti ai criteri. Le differenze e un riepilogo funzionale vengono aperti nell’editor; i sorgenti principali restano intatti.
7. Rivedere il codice e avviare **Run Tests**. L’eseguibile e gli argomenti sono scelti dal prodotto: `node --test` sui file dichiarati. I test vengono eseguiti sul computer con i privilegi dell’utente, dopo la conferma e il controllo di attendibilità del workspace. Un worktree è una copia recuperabile, non una sandbox del sistema operativo.
8. Solo un esito positivo abilita **Apply Verified Changes**. Il prodotto ricontrolla contesto, sorgenti e worktree, poi applica i file revisionati. Un test fallito, un annullamento o una modifica successiva non vengono presentati come successo.
9. **Undo Implementation** ripristina le preimmagini esatte, anche dopo la riapertura tramite **Resume Implementation**. Modifiche manuali successive bloccano l’annullamento invece di essere sovrascritte. **Recover Interrupted Implementation** recupera una transazione interrotta quando ogni file corrisponde ancora a una delle immagini registrate.

Dopo applicazione o annullamento, **Sync** aggiorna il modello osservato dal codice. M5 conserva i risultati nel registro dell’operazione; la riconciliazione bidirezionale automatica resta in M6. Un record di test non viene aggiunto al modello come prova generale del comportamento runtime.

## Parti deterministiche e parti affidate al modello

Parser, compilatore, scansione del manifest M4, identità, scelta dei file suggeriti, schema dei messaggi, validazione, limiti, hash, Git, differenze, persistenza, test e rollback sono deterministici. Le CLI ricevono il problema circoscritto per proporre piano e implementazione. La generazione non applica comandi suggeriti dal modello e non installa dipendenze del progetto.

Le chiamate strutturate partono da una directory temporanea senza il progetto. Codex usa il sandbox in sola lettura e disabilita shell, unified exec, applicazioni, plugin, subagenti, hook e ricerca delle skill; la configurazione esplicita disabilita ricerca web e server MCP. Claude usa modalità plan, strumenti vuoti, MCP esplicito vuoto e nessuna sorgente di impostazioni del progetto. La CLI interattiva aperta dall’utente conserva invece il comportamento originale del provider.

**Interpret Unresolved Evidence** considera soltanto diagnostiche residue esplicite di M4. Quando non ci sono residui pertinenti, termina con zero invocazioni IA. Le risposte citano gli ID delle diagnostiche e degli elementi già presenti; rimangono ipotesi separate dal modello, senza inventare identificatori, intervalli o evidenze di esecuzione.

Il budget salvato ammette zero, una o due **invocazioni della CLI per operazione**: preparazione locale; solo piano; piano e implementazione. Non è un tetto al numero di richieste HTTP o ai token interni della CLI, che gestisce autonomamente i propri turni, retry e quote. Il prodotto non effettua retry o passaggi automatici a un modello più costoso. Per usare un modello più capace occorre selezionarlo esplicitamente e rivedere il nuovo contesto.

Timeout e cancellazione terminano il gruppo dei processi sulle piattaforme Unix. L’input completo e gli artifact sono limitati in byte; l’output parziale, malformato o incoerente viene rifiutato. Token non riportati restano sconosciuti. `total_cost_usd` di Claude può rappresentare un equivalente API anche con un abbonamento, quindi non viene mostrato come addebito effettivo.

## Recupero e confini

I worktree sono in `.ade/worktrees/<id>`; registro, preimmagini e transazione in `.ade/collaboration/<id>`. Le scritture sono sostituzioni per file con un registro recuperabile, non una singola transazione atomica dell’intero filesystem. I percorsi gestiti e i file selezionati rifiutano symlink e attraversamenti di directory. Una transazione interrotta viene ripristinata soltanto se non richiede di cancellare modifiche manuali sconosciute.

L’editor e il ponte con il codice riusano lo stesso worker: un secondo worker con lo stesso `moduleId` terminerebbe quello precedente. Lo stato della collaborazione è mantenuto attraverso le API del servizio del codice e i registri su disco.

Il percorso di verifica iniziale usa test Node direttamente eseguibili, soprattutto `.test.mjs`. Non esegue automaticamente script npm, build di framework, shell o installazioni. Ambienti Python/Java/altri linguaggi, progetti Node che richiedono dipendenze non presenti nel worktree, Windows e sandbox di esecuzione più restrittive richiedono adattatori e collaudi dedicati. L’apertura della CLI originale resta disponibile per gli approfondimenti tecnici.

## Confronto dei modelli

**Compare AI Models** confronta due modelli espliciti dello stesso account su tre repository Git campione indipendenti: checkout con pagamento rifiutato, prenotazione delle scorte e autorizzazioni. I test di accettazione mantenuti dal prodotto sono separati dai test generati e non entrano nel contesto del modello. Possono quindi bocciare un’implementazione anche quando i suoi test generati passano.

Le soglie sono nel modulo `ade/ai/benchmark.ts`: tre repository distinti; tutti i controlli indipendenti superati; riferimenti a feature, criteri ed evidenze validi; durata massima di 360 secondi per caso. La validità dei riferimenti è una misura strutturale, non una stima universale di precisione/recall semantica. Il rapporto conserva hash dei campioni, esiti, tempi, token disponibili e unità delle eventuali tariffe quotate. I risultati possono essere esportati con **Export Model Benchmark Results**.

Il default economico viene proposto soltanto per risultati live idonei, modello ancora disponibile e tariffe confrontabili dello stesso provider. Le stime derivate da tariffe quotate sono consumo stimato nell’unità dichiarata, non addebiti effettivi. Risultati simulati, dati mancanti, unità incompatibili, perdita di tracciabilità, un test fallito o un modello non disponibile impediscono la selezione. Il selettore nativo propone per primo il default misurato soltanto se le tariffe sono ancora uguali e il rapporto ha meno di trenta giorni; la scelta dell’utente resta esplicita.

I test locali simulati verificano questi criteri, ma non stabiliscono quale modello commerciale sia migliore. Il [verbale](m5-verification.md) conserva questa distinzione.

## CLI di sviluppo

La UI usa lo stesso motore delle verifiche Node. Per eseguirlo separatamente, usare Node da `.nvmrc` e installare i due pacchetti con i relativi lockfile:

```sh
npm --prefix ade/code-import ci --ignore-scripts
npm --prefix ade/ai ci --ignore-scripts
npm --prefix ade/ai run check
npm --prefix ade/ai test
```

Esempio di configurazione senza credenziali:

```json
{
  "version": 1,
  "provider": "codex",
  "connection": "cli",
  "executable": "codex",
  "model": "MODEL_ID_FROM_YOUR_ACCOUNT",
  "timeoutMs": 180000,
  "maxContextBytes": 262144,
  "maxCalls": 2
}
```

La richiesta contiene `version`, `snapshot`, `featureId`, `intent`, `constraints` e `sourceFiles`. Le directory degli artifact di uscita devono esistere; gli artifact esterni non vengono sovrascritti né scritti nell’albero sorgente.

```sh
node ade/ai/cli.mjs prepare request.json config.json /tmp/ade-review.json
node ade/ai/cli.mjs propose /tmp/ade-review.json REVIEW_ID /tmp/ade-plan.json
node ade/ai/cli.mjs run operation.json /tmp/ade-result.json
```

`run` accetta un oggetto con le stesse operazioni del ponte nativo:

| Operazione | Campi | Risultato |
| --- | --- | --- |
| `prepare` | `request`, `config` | Contesto e `reviewId`, senza IA |
| `plan` / `interpret` | `prepared`, `reviewId` | Proposta validata o ipotesi residue |
| `stage` | `prepared`, `plan`, `reviewId` del piano (`planId`) | Sessione con differenze in worktree |
| `verify` | `root`, `id`, `reviewId` delle modifiche | Test Node e stato `passed`/`failed` |
| `apply` / `undo` | `root`, `id`, `reviewId` delle modifiche | Applicazione o ripristino condizionato |
| `session` / `recover` | `root`, `id` | Ripresa o recupero della transazione |
| `benchmark` | `candidates`, ognuno con `config` e tariffe opzionali `rates` | Rapporto misurato e possibile default |

Gli oggetti `prepared` e `plan` sono quelli completi restituiti dalle operazioni precedenti, non riferimenti a nomi di file. Un’anteprima modificata, scaduta rispetto ai sorgenti o relativa a un altro modello/provider viene rifiutata.
