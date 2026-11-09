<!-- Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. -->

# Accettazione DAI-04

Attesi fissati prima dell'implementazione, 9 novembre 2026. Corpus v1, budget v1 e artefatti DAI-01/02/03 restano congelati.

| Caso | Input indipendente | Esito richiesto |
| --- | --- | --- |
| C01 | Intero quantità > zero, input assente/null/zero/positivo/negativo e limiti safe integer | Stesso risultato in interprete e modulo generato; nessuna coercizione |
| C02 | Confronto quantità/denaro, output letto in precondizione, nodo sconosciuto/ciclico | Diagnostica e blocco, nessuna esecuzione arbitraria |
| C03 | Profilo/versione/toolchain non riconosciuti, stati/frame/persistenza richiesti | Blocco esplicito; nessuna capacità produttiva anticipata |
| C04 | Blueprint DAI-03 e libreria con cento operazioni indipendenti, una usata | Solo contratto necessario, tipi transitivi, errori, owner e ADR applicabili |
| C05 | Cicli di tipi, scenari ordinati, consumer e cambiamento incompatibile | Nessun duplicato; ordine semantico conservato; consumer dichiarati |
| C06 | Stesso task, cambio layout, cambio indipendente, ADR applicabile, profilo/provider diversi | Byte identici nei primi casi; sigillo/cache invalidati nei casi pertinenti |
| C07 | Contratto obbligatorio oltre budget, riserve input/output/overhead | Blocco senza omissioni; conteggio dell'intero payload e lacune token/costo esplicite |
| C08 | Finestre UTF-16 sovrapposte, rinomina sorgente, frammenti discordanti | Merge senza letture nuove; revisione sigillata; discordanza respinta |
| C09 | ID inventato, scrittura fuori scope, nuova identità temporanea non dichiarata, ancora ambigua | Risposta respinta localmente prima di applicare |
| C10 | needContext entro/fuori scope e istruzione ostile nel sorgente | Ampliamento solo nel perimetro autorizzato, nuova disclosure/sigillo; testo resta dato |
| C11 | Chiarimento, unsupported, output con claim test o comando shell | Intento versionato; esiti discriminati stretti; claim/comando respinti |
| C12 | Editor guardia, annullamento, salvataggio/undo/riapertura e anteprima | Transazione nativa, identità persistenti, zero chiamate IA |

Le prove del profilo sono limitate a predicati e compilazione strutturale; forward/reverse del progetto appartengono a DAI-05. Nessun risultato provider live o desktop completo può essere dedotto da test di dominio o renderer.
