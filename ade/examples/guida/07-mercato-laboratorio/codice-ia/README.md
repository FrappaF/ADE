# Mercato with Acquisto and Resi

This module is the starter codebase for L17 of the ADE user guide. Copy the `codice-ia` folder, open a terminal in the copy and run `npm test` with Node.js 24 to check the five cases. In ADE choose **Import Codebase** and select the same folder. Review the proposed diagrams for **Acquisto** and **Resi**, then follow the evidence back to the source files and tests.

Both features work with the same **Ordine**. **Acquisto** calculates the total in cents and records the order only after the simulated check succeeds. **Resi** looks up the stored order and checks a 30-day return window. The sample uses synthetic data and an in-memory store.
