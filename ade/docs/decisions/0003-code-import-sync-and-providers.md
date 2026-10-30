# ADR 0003 — Importazione assistita, Sync incrementale e provider configurabili

Stato: adottata il 29 ottobre 2026; aggiornata su richiesta dell'utente il 30 ottobre 2026: M4 deterministico e multilinguaggio, integrazione IA in M5. Pianifica M4–M6; [importazione M4.1 e Sync M4.2](../code-import.md) descrivono gli incrementi disponibili via Node.

## Decisione

A.D.E ricostruisce la struttura osservabile della codebase mediante strumenti deterministici: parser e servizi del linguaggio estraggono simboli, import, chiamate, riferimenti e contratti secondo le capacità dichiarate dell'adattatore. La base deve coprire i linguaggi più usati, anche mediante soluzioni specifiche per linguaggio. L'importazione M4 deve funzionare senza account IA. Prima di introdurre inferenza, si cercano strumenti e pattern consolidati senza IA; metadati, configurazioni e regole esplicite hanno priorità. L'integrazione IA appartiene a M5 e può proporre responsabilità o feature soltanto dove le evidenze e gli strumenti deterministici non bastano. Output strutturati, validazione, identità, layout e rendering restano responsabilità del prodotto.

La prima importazione percorre tutto il sorgente pertinente dello stack supportato, escludendo dipendenze vendorizzate, output di build e file generati secondo regole dichiarate. Produce un indice completo del perimetro supportato e diagrammi gerarchici, con dettaglio per sistema e feature. File e costrutti non supportati restano identificabili. Un riferimento rilevato dal parser, un'interpretazione del modello e un comportamento osservato in esecuzione sono evidenze diverse: l'importazione non certifica il comportamento runtime.

## Modelli e valutazione

L'utente sceglie provider e modello fra quelli disponibili per la connessione utilizzata. L'impostazione predefinita è il modello più economico che soddisfa capacità richieste e soglie di qualità misurate sul benchmark del prodotto. La disponibilità nel catalogo non certifica automaticamente l'accesso dell'account. Non viene fissato nel codice un nome commerciale come requisito universale.

Si usano unità di lavoro circoscritte, output strutturati validati e cache dei risultati per revisione. Un modello più capace può essere configurato per casi ambigui; il passaggio a un modello più costoso segue la scelta dell'utente e il budget salvato. Quote di abbonamento, token e costi monetari vengono distinti; valori non disponibili non sono stimati come misure effettive.

Prima di adottare un modello economico come default si confrontano almeno tre repository campione dello stack iniziale con una ricostruzione di riferimento. Si misurano copertura, collegamenti errati o mancanti, attribuzione alle feature, tracciabilità delle evidenze, conservazione dell'identità dopo modifiche, latenza e consumo disponibile. Le soglie e il risultato vengono pubblicati; una buona risposta dimostrativa non sostituisce il benchmark.

## Pulsante Sync

Il rilevamento locale mantiene l'elenco delle modifiche; il comando **Sync** avvia su richiesta dell'utente la ricostruzione incrementale. Non viene richiesta una lettura completa della codebase al modello a ogni pressione del pulsante.

Si confrontano hash e revisioni dell'ultima sincronizzazione con lo stato corrente e si rianalizzano simboli modificati e dipendenze interessate con gli strumenti deterministici. Da M5, soltanto eventuali interpretazioni residue richiedono il contesto pertinente all'IA. Rinominare o spostare un simbolo deve conservarne l'identità quando l'adattatore può dimostrarne la continuità; i casi ambigui restano espliciti. Gli aggiornamenti vengono validati e applicati come operazioni coerenti, preservando posizioni e annotazioni dell'utente. Le modifiche manuali del modello non vengono sostituite silenziosamente.

Un'operazione annullata, fallita o basata su una revisione superata non aggiorna il riferimento dell'ultima sincronizzazione riuscita. Sono previsti riepilogo delle modifiche, diagnostiche, conflitti e possibilità di ripristino. Importazione e Sync del codice verso il modello possono essere realizzati in M4; M6 completa la riconciliazione bidirezionale con le modifiche prodotte dal modello e dall'IA.

## Connessioni e account

API dirette, piani personali e processi agent locali sono modalità distinte, con capacità, cataloghi, credenziali e consumi propri. Le credenziali restano fuori dai documenti e dal repository, attraverso gli strumenti di autenticazione e archiviazione sicura del prodotto.

- **OpenAI:** valutare il flusso ufficiale Sign in with ChatGPT per applicazioni open source eseguite localmente e l'integrazione Codex app-server. Applicazioni a pagamento o ospitate remotamente richiedono verifica del percorso previsto dal provider. Restano previste anche credenziali API personali.
- **Claude via API/Agent SDK:** usare le modalità di autenticazione ammesse dall'API. Offrire direttamente il login claude.ai nell'applicazione richiede l'approvazione prevista da Anthropic.
- **Claude Code locale:** un eventuale adattatore al binario originale, non modificato, con login effettuato dall'utente attraverso il flusso Anthropic, viene valutato separatamente dall'Agent SDK e dall'uso diretto delle API. Non si riutilizzano token estratti dalle sessioni di altre applicazioni.

Le condizioni dei provider vanno ricontrollate prima dell'implementazione e della distribuzione. Le fonti consultate il 29 ottobre 2026 sono [ChatGPT plan usage per applicazioni open source locali](https://developers.openai.com/siwc/token-sharing-open-source), [Codex app-server](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server), [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview) e [condizioni di integrazione di Claude Code](https://code.claude.com/docs/en/legal-and-compliance).

## Conseguenze sulla roadmap

M2 completa l'esperienza di progettazione. M4 sviluppa importazione e tracciabilità deterministiche multilinguaggio, risoluzione semantica specifica e Sync senza IA. M4.1 fornisce la base sintattica Node; M4.2 aggiunge cache, stato e Sync verso versioni recuperabili con conservazione delle modifiche manuali compatibili. Il grafo semantico e il percorso nativo restano incrementi successivi. M5 introduce connessioni ai provider, interpretazioni residue e modifica assistita del codice, insieme al benchmark dei modelli. M6 implementa riconciliazione e risoluzione dei conflitti fra codice e modello. L'efficacia del modello economico e la copertura semantica di ogni linguaggio restano risultati da verificare.
