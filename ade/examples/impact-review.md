# Revisione dell'impatto senza sorgente

Questo percorso usa le dichiarazioni degli esempi A.D.E. Non richiede importazione del codice e non contiene risultati di test inventati.

## Contratto di pagamento nell'esempio integrato

1. Dalla home scegliere **Explore Purchase Example**, poi **Conferma acquisto → Percorso acquisto** nella sidebar.
2. Selezionare **Richiedi pagamento** e seguire nelle proprietà la relazione **Richiedi pagamento → Pagamento: realizza contratto**. Il contratto apre Element Details perché non è collocato in un diagramma.
3. Scegliere **Show Change Impact**. Il perimetro contiene il contratto; i possibili dipendenti sono Richiedi pagamento, Servizio pagamenti, Conferma ordine, Checkout e Cliente. Ogni voce mostra un riferimento dichiarato e la sua distanza dal perimetro.
4. Il contesto dei proprietari mostra Conferma acquisto separatamente dai dipendenti. I diagrammi da rivedere includono Percorso acquisto, Esito pagamento e Percorso annullamento: quest'ultimo rappresenta lo stesso Cliente raggiunto dall'analisi.
5. Aprire una voce o un diagramma, poi usare Back/Forward. **Read Change Impact** presenta lo stesso report nel lettore nativo. La navigazione non modifica il modello.

Le risorse Carrello e Ordine raggiunte solo da riferimenti uscenti non diventano automaticamente dipendenti del contratto. Le relazioni che le collegano agli elementi inclusi restano consultabili in Relationships to Review. Nell'esempio integrato non sono registrate mappature al codice né verifiche: Recorded Evidence mostra i rispettivi conteggi a zero.

## Risorsa e stati nell'esempio progettato

Aprire [checkout-designed.ade.json](checkout-designed.ade.json), selezionare **Ordine** in Struttura acquisto e scegliere Show Change Impact. Il perimetro comprende la risorsa e i suoi stati; i riferimenti dichiarati risalgono a controller, interfaccia e attore. Struttura acquisto e Stati ordine restano raggiungibili dal report.

Le azioni del flusso e gli stati dell'ordine sono identità diverse. L'analisi non inventa un legame causale fra loro e non include automaticamente ogni vista della stessa feature. Una vista esclusa dal report non dimostra assenza di dipendenze nel codice: descrive soltanto i riferimenti disponibili nel modello.

## Documenti con evidenze registrate

Se un documento contiene `codeMappings` o `verifications`, Inspect Recorded Evidence mostra file/simbolo/revisione e tutti gli esiti con criterio, evidenza e revisione. Criteri senza registrazioni e criteri con esiti diversi restano distinguibili. Un record passato non certifica la versione corrente e l'ordine dei record non stabilisce il risultato più recente. Il runner usa fixture sintetiche separate per verificare questi casi; gli esempi di prodotto non vengono riempiti con esiti fittizi.
