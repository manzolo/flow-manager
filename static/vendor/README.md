# Vendored third-party assets

Librerie front-end servite localmente (anziché da CDN) per rendere i container
**autosufficienti** e senza dipendenze di rete esterne a runtime.

Tutte permissive; il self-hosting è consentito. I file `.min.js`/`.min.css` conservano
il banner di licenza originale in testa.

| File | Libreria | Versione | Licenza |
|---|---|---|---|
| `js-yaml.min.js` | js-yaml | 4.1.0 | MIT |
| `marked.min.js` | marked | 4.0.18 | MIT |
| `highlight/highlight.min.js` | highlight.js | 11.8.0 | BSD-3-Clause |
| `highlight/github-dark.min.css` | highlight.js theme | 11.8.0 | BSD-3-Clause |
| `jspdf.umd.min.js` | jsPDF | 2.5.1 | MIT |
| `jspdf.plugin.autotable.min.js` | jspdf-autotable | 3.8.2 | MIT |
| `font-awesome/css/all.min.css` | Font Awesome 5 Free (CSS) | 5.15.4 | MIT |
| `font-awesome/webfonts/*.woff2` | Font Awesome 5 Free (font) | 5.15.4 | SIL OFL 1.1 |
| `fonts/dejavu.js` | DejaVu Sans (subset, TTF base64 per jsPDF) | 2.37 | DejaVu Fonts (Bitstream Vera + Arev) |

`fonts/dejavu.js` incorpora **DejaVu Sans** Regular+Bold, sottoinsieme ai range Latin/punteggiatura/
frecce/forme/dingbat, in base64, così il PDF del risultato rende glifi Unicode reali (bullet, frecce,
dash, accentate) senza dipendere dai font standard di jsPDF (solo Latin-1). Licenza DejaVu Fonts
(derivata Bitstream Vera + Arev), redistribuzione libera: <https://dejavu-fonts.github.io/License.html>.
Il subset si rigenera con `fontTools.subset` dai TTF `dejavu-fonts-ttf`.

Font Awesome **Free**: codice MIT, webfont SIL OFL 1.1, icone CC BY 4.0
(<https://fontawesome.com/license/free>). Usata solo la famiglia *solid* (`fas`);
i woff2 *regular*/*brands* sono inclusi ma non referenziati dall'app.

Origine: tutti scaricati da cdnjs.cloudflare.com agli stessi path/versione che erano
referenziati nei template. Per aggiornare: riscaricare la nuova versione, sostituire il
file e aggiornare versione/licenza qui.
