<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# Mercato · Codebase da importare

Progetto autonomo in JavaScript per Node.js 24. Acquisto e Resi usano lo stesso archivio ordini. Il server HTTP ascolta su `127.0.0.1`, simula l’esito del pagamento e registra gli eventi in un outbox locale in memoria. Ogni riavvio riparte con ordini ed eventi vuoti.

## Esegui e prova

Apri un terminale nella cartella `08-mercato-codebase` ed esegui questi comandi con Node.js 24. Le dipendenze sono incluse in Node.js.

```sh
npm test
npm start
```

I test verificano i limiti della quantità, il totale in centesimi, il pagamento rifiutato, l’ordine duplicato, la finestra di reso e il percorso HTTP con gli eventi. Il server stampa l’indirizzo locale e usa la porta `3080` per impostazione predefinita. Se è occupata, puoi impostare la variabile d’ambiente `PORT` prima dell’avvio.

Prova queste richieste in un secondo terminale.

```sh
curl -sS -X POST http://127.0.0.1:3080/checkout -H 'Content-Type: application/json' -d '{"orderId":"ordine-1","quantity":2,"unitPriceCents":1250,"approved":true}'
curl -sS http://127.0.0.1:3080/orders/ordine-1
curl -sS -X POST http://127.0.0.1:3080/orders/ordine-1/return
curl -sS http://127.0.0.1:3080/events
```

L’acquisto conferma un ordine da `2500` centesimi. Il reso restituisce lo stesso ID, imposta lo stato `returned` e riporta `2500` centesimi come importo del rimborso simulato. L’ultima risposta contiene `order.confirmed` seguito da `order.returned`. Se invii di nuovo il reso, ricevi `409` con `already-returned`. Il reso è ancora valido esattamente 30 giorni dopo la conferma dell’acquisto. Ferma il server con `Ctrl+C`.

## Importa in ADE

1. Copia la cartella `08-mercato-codebase` in una nuova destinazione e seleziona la copia dalla Home con **Import Codebase**.
2. Scegli **Structure and Available Semantic Analysis**. Quando appare **Source Inventory Ready**, cerca le dichiarazioni indicate qui sotto e apri le fonti corrispondenti.
3. Facoltativamente scegli **Explore Architecture** con un provider configurato. Controlla che le viste proposte distinguano Acquisto e Resi, usino un’unica identità per Ordine e colleghino ogni comportamento alla fonte. Dalla review puoi applicare i diagrammi alla copia.

| Evidenza | Sorgente da aprire |
| --- | --- |
| Entrata HTTP, instradamento e composizione di un solo archivio e un solo outbox | `src/main.mjs` e `createMercatoServer` in `src/server.mjs` |
| Quantità intera da 1 a 10, calcolo sicuro in centesimi e ramo di rifiuto | `checkout` in `src/checkout.mjs` e `authorizePayment` in `src/payments.mjs` |
| Record Ordine e passaggio da `confirmed` a `returned` | `createOrderStore` in `src/orders.mjs` |
| Ricerca dello stesso ordine, limite dei 30 giorni e prevenzione dei doppi resi | `returnOrder` in `src/returns.mjs` |
| Pubblicazione locale in ordine e verifica del flusso HTTP | `createOutbox` in `src/outbox.mjs` e `test/mercato.test.mjs` |

Per la review delle viste, cerca un confine HTTP, i due flussi e i rami di rifiuto o scadenza. Descrivi l’outbox come memoria locale. La sincronizzazione con un broker, il pagamento reale e la persistenza sono fuori dal perimetro di questo esempio.
