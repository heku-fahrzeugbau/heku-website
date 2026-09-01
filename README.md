# HEKU Website: Aufbau und Pflege

Statische Website auf GitHub Pages mit eigener Domain. Bestehende Hauptseiten und Bilder behalten ihre URLs; keine allgemeine URL-Migration in diesem Änderungsvorschlag.

## Zuständigkeiten

```text
artikel/                       generierte Detailseiten, z.B. 50241.html
content/produkte/produkte.json EINZIGE Quelle für öffentliche Produktdaten
scripts/                       aktive Generatoren und Tests
  templates/product-page.tpl   gemeinsame Vorlage für Artikel
.github/workflows/             aktive GitHub-Actions-Workflows
shop.html                      generierter Katalog plus Bestell-/Versandlogik
product-detail.css             Darstellung der Artikel-Detailseiten
sitemap.xml                    automatisch generierte Sitemap
*.html                         bestehende Hauptseiten
assets/produkte/produkt-*.jpg  Produktbilder nach interner Produkt-ID
```

`shop.html`, `artikel/` und die markierten Artikellinks der Kategorieseiten werden aus `content/produkte/produkte.json` abgeleitet. Diese Bereiche nicht von Hand pflegen. Bestellformular, Warenkorb und Versandlogik bleiben in `shop.html`; Hauptseiten und Kategorie-Auswahltexte bleiben an ihrem bisherigen Ort. Produktbilder liegen gesammelt unter `assets/produkte/`.

## Produktdaten ändern

Nur den passenden Datensatz in `content/produkte/produkte.json` bearbeiten. Namen und Beschreibungen sind Klartext. Artikelnummern (`sku`) und interne IDs müssen eindeutig bleiben. Preise werden als positive Zeichenkette mit genau zwei Nachkommastellen gepflegt, z.B. `"price": "75.00"`. Der sichtbare deutsche Preis wird daraus generiert; eine zweite manuelle Preisangabe gibt es nicht mehr. Ungültige oder doppelte Daten brechen den Build bewusst ab.

```sh
node scripts/build-site.mjs
node --test scripts/test-seo.mjs scripts/test-products.mjs
```

Node.js22 oder neuer; keine npm-Installation erforderlich. Shop, Produktseiten und JSON-LD übernehmen dieselben zentralen Produktdaten. Keine unbekannten Lieferzeiten/Bestände/Passformen erfinden. Logo-Platzhalter werden nicht als Produktfotos verwendet.

Neue Produktbilder nach dem Schema `assets/produkte/produkt-{interne ID}.jpg` ablegen und den Pfad im Feld `image` des Produktdatensatzes eintragen. Der Build bricht bei fehlenden oder außerhalb dieses Ordners referenzierten Produktbildern bewusst ab.

Artikelnummern bilden die URL `/artikel/NUMMER.html`. Bei SKU-Änderung oder Löschung zuerst die alte URL bewusst stilllegen/weiterleiten; der Generator stoppt bei verwaisten Dateien. Vorhandene flache `shop-artikel-NUMMER.html` werden nicht automatisch gelöscht oder übergangen.

## Änderungen veröffentlichen

Änderungen auf separatem Branch prüfen und als Pull Request vorlegen. PR-Prüfung baut und testet ohne Push oder Deployment. **Merge nach main erst nach Freigabe.** Dann generiert der vorhandene Sitemap-Workflow die Dateien erneut, committet Änderungen und fordert einen Pages-Build an. Generator- UND Pages-Ergebnis und Live-Seiten prüfen.

Voraussetzung für diesen Veröffentlichungsschritt: branchbasiertes GitHub Pages von main/root, Berechtigungen contents:write und pages:write. Der erste echte Durchlauf mit Produktseiten ist noch zu bestätigen; ein grüner lokaler Test ist kein Deployment-Nachweis.

## Später gezielt aufräumen – nicht Teil dieses PR

- Die ähnlich benannten Dateien `sitemap.yml`, `generate-sitemap.mjs`, `test-seo.mjs` im Hauptverzeichnis und `github/workflows/` sind nicht die vom aktuellen Workflow referenzierten Pfade. Nach Herkunfts-/Referenzprüfung separat bereinigen; nicht pauschal löschen.
- `files.zip` auf Zweck prüfen und Backups künftig außerhalb der veröffentlichten Website halten. Noch nicht verschoben oder gelöscht.
- Weitere gemeinsam genutzte Bilder/CSS/JS können später schrittweise unter `assets/` gesammelt werden. Bestehende öffentliche Dateien nicht ohne vollständige Pfadprüfung verschieben.
- Bestehende öffentliche Hauptseiten-URLs vorerst stabil lassen. Ordentlichere GitHub-Ordner allein rechtfertigen keine riskante URL-Umstellung.

Der bisherige ZIP-Entwurf mit Produktseiten im Hauptverzeichnis wird durch den Ordner-Entwurf ersetzt. Nicht beide Varianten mischen.
