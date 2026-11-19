# Progetti della guida ADE

Inizia dalla Parte I della guida completa: apri con Open Project la cartella `01-bottega-visuale`, che contiene le feature Acquisto e Resi e rimborsi, con otto viste.

Nella Parte II costruisci Mercato: `07-mercato-laboratorio/inizio` è vuota per Create Project; `tappe` contiene due riferimenti progressivi; `soluzione` contiene 18 viste nelle 16 notazioni. `moduli` ospita quantità, interazioni, stati e messaggi, ciascuno in una root ADE autonoma. Il sottoprogetto `codice` si esegue con npm test/npm start e si apre con Import Codebase. Le cartelle 02-06 conservano le stesse basi anche separatamente.

Per i nuovi laboratori IA apri `07-mercato-laboratorio/codice-ia` con **Import Codebase** per L17 e `07-mercato-laboratorio/moduli/generazione-ia` con **Open Project** per L18. Acquisto e Resi condividono il contratto Ordine in entrambi gli esercizi. Ogni laboratorio parte da una copia della propria cartella.

Per provare l’importazione su un progetto autonomo di soli sorgenti, estrai una copia di `08-mercato-codebase` e selezionala con **Import Codebase**. L’archivio ordini condiviso e gli eventi locali offrono evidenze da seguire tra Acquisto e Resi. [Istruzioni e test](08-mercato-codebase/LEGGIMI.md)

Copia le cartelle intere, inclusi i dati nascosti del modello. Non occorre aprire o modificare JSON. Non aprire 07-mercato-laboratorio come se fosse una singola root ADE: scegli il sottoprogetto della lezione. I checkpoint sono salvataggi reali della costruzione fino a L3 e L5, senza contenuti delle lezioni successive.

I laboratori locali non richiedono un account IA. Le varianti eseguibili usano il runtime Node indicato nella guida. I materiali non contengono Git personali, credenziali, sessioni IA o cache di importazione. Gli esempi sono sintetici; deployment, rete e schema DB sono progettati e non rappresentano servizi distribuiti attivi.
