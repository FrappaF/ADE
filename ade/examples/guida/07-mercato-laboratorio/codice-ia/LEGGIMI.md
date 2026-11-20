# Mercato con Acquisto e Resi

Questo modulo è la codebase di partenza per L17 della Guida ADE. Copia la cartella `codice-ia`, poi apri un terminale nella copia ed esegui `npm test` con Node 24 per controllare i cinque casi. In ADE scegli **Import Codebase** e seleziona la stessa cartella. Esamina i diagrammi proposti per Acquisto e Resi e segui le evidenze fino ai sorgenti e ai test.

Entrambe le feature lavorano sullo stesso Ordine. Acquisto calcola un totale in centesimi e registra l’ordine soltanto dopo l’esito positivo della verifica simulata. Resi cerca l’ordine registrato e valuta una finestra didattica di 30 giorni. Il campione usa dati sintetici e un archivio in memoria.
