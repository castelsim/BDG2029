# Il Battito di Bitcoin — BDG2029

Pagina pubblica dell'installazione audiovisiva «Il Battito di Bitcoin»
(nome di lavorazione: Camera Cieca), candidata per la mostra «Dentro Bitcoin» —
Bassano del Grappa Capitale italiana della Cultura 2029.

**Live:** https://simonecastellan.com/BDG2029

- Demo dal vivo: particelle = transazioni Bitcoin reali (WebSocket mempool.space),
  anello = riempimento del prossimo blocco, audio granulare su richiesta (WebAudio).
- Fallback simulato, etichettato, se la rete non è raggiungibile.
- Zero dipendenze, zero build, zero tracciamento. `node --test` per i test.

Progetto: Simone Castellan · CryptoBassano — https://cryptobassano.it

## Pubblicazione

Il dominio serve le sottopagine come cartelle del repo `castelsim/simonecastellan`.
Dopo ogni modifica qui, sincronizzare la copia pubblicata:

```bash
cp -R index.html style.css js assets ../simonecastellan/BDG2029/
cd ../simonecastellan && git add BDG2029 && git commit -m "Aggiorna BDG2029" && git push
```
