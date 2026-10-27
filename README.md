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

`bootsanhaenger-bielefeld.html` ist die lokale Standortseite für Bielefeld und OWL. Sie enthält Adresse, Anfahrt und die bestätigten Öffnungszeiten mit Mittagspause. Änderungen an den Geschäftszeiten müssen gleichzeitig in den sichtbaren Kontaktangaben und allen `LocalBusiness`-Daten vorgenommen werden; die Tests sichern die aktuelle Aufteilung 08:00–12:30 Uhr und 13:00–16:30 Uhr ab.

`ersatzteile-bootsanhaenger.html` ist der zentrale Ersatzteil-Ratgeber und Einstieg in die sieben Zubehör-Kategorien. Die Kategorien und ihre Artikelanzahl werden beim Build aus `content/produkte/produkte.json` erzeugt. Neue Kategorien müssen zentral in `scripts/generate-product-pages.mjs` ergänzt werden; keine Passform für Fremdhersteller ohne fachliche Bestätigung zusagen.

`shop.html`, `artikel/`, die markierten Artikellinks der Kategorieseiten und mit `data-catalog-sku` markierte Preislisten-Zeilen werden aus `content/produkte/produkte.json` abgeleitet. Diese Bereiche nicht von Hand pflegen. Bestellformular, Warenkorb und Versandlogik bleiben in `shop.html`; Hauptseiten und Kategorie-Auswahltexte bleiben an ihrem bisherigen Ort. Produktbilder liegen gesammelt unter `assets/produkte/`.

Artikelseiten verlinken den Shop über `shop.html#artikel-<id>`. Das Fragment wählt die Produktkarte aus und ist keine eigene Adresse. `shop.html?artikel=<Artikelnummer>` würde Google als weitere Shop-URL crawlen. Die Abfrage bleibt im Shop auswertbar, damit Lesezeichen und bereits erfasste Adressen den Artikel weiter öffnen; neue Kauf-Buttons setzen sie nicht mehr.

## Produktdaten ändern

Nur den passenden Datensatz in `content/produkte/produkte.json` bearbeiten. Namen und Beschreibungen sind Klartext. Artikelnummern (`sku`) und interne IDs müssen eindeutig bleiben. Preise werden als positive Zeichenkette mit genau zwei Nachkommastellen gepflegt, z.B. `"price": "75.00"`. Der sichtbare deutsche Preis wird daraus generiert; eine zweite manuelle Preisangabe gibt es nicht mehr. Ungültige oder doppelte Daten brechen den Build bewusst ab.

Technische Daten eines Artikels stehen optional im selben Datensatz unter `technische_daten`. Das ist eine Liste von Einträgen mit den Klartextfeldern `bezeichnung` und `wert` (zum Beispiel Spannung und `12 V`). Der Build rendert daraus den Abschnitt „Technische Daten“ auf `/artikel/NUMMER.html` und gibt dieselben Paare als `additionalProperty` (`PropertyValue`) im Product-JSON-LD aus. Fehlt die Liste oder ist sie leer, erscheint kein Abschnitt und das JSON-LD bleibt ohne `additionalProperty`. HTML in Bezeichnung oder Wert sowie Einträge ohne genau diese beiden Felder brechen den Build ab. Die generierte Artikelseite nicht von Hand ergänzen.

```sh
node scripts/build-site.mjs
node --test scripts/test-seo.mjs scripts/test-products.mjs
```

Node.js22 oder neuer; keine npm-Installation erforderlich. Shop, Produktseiten und JSON-LD übernehmen dieselben zentralen Produktdaten. Keine unbekannten Lieferzeiten/Bestände/Passformen erfinden. Logo-Platzhalter werden nicht als Produktfotos verwendet.

Neue Produktbilder nach dem Schema `assets/produkte/produkt-{interne ID}.jpg` ablegen und den Pfad im Feld `image` des Produktdatensatzes eintragen. Der Build bricht bei fehlenden oder außerhalb dieses Ordners referenzierten Produktbildern bewusst ab.

Artikelnummern bilden die URL `/artikel/NUMMER.html`. Bei SKU-Änderung oder Löschung zuerst die alte URL bewusst stilllegen/weiterleiten; der Generator stoppt bei verwaisten Dateien. Vorhandene flache `shop-artikel-NUMMER.html` werden nicht automatisch gelöscht oder übergangen.

## Modelldaten ändern (Bootsanhänger B 350 bis B 3500)

- Einzige Quelle für die Modellseiten `bootsanhaenger-b*.html` und den Modellblock auf `produkte.html`: `content/modelle/modelle.json`.
- Generator: `scripts/generate-model-pages.mjs` mit Vorlage `scripts/templates/model-page.tpl`, aufgerufen von `node scripts/build-site.mjs`. Die generierten Seiten nicht von Hand bearbeiten.
- `preisAb: null` bedeutet „Preis auf Anfrage“: Die Seite erhält dann bewusst kein Product/Offer-Markup. Der B 2700 ist bestätigt: Preis ab 5.310 €, maximale Bootslänge 6,60 m.
- Der Generator bricht ab, wenn Zulassung (B 350–B 2000 CoC, ab B 2500 TÜV-EG), Tempo 100 (ungebremst serienmäßig, Einachser + 140 €, Tandem + 280 €), Preisformat oder Bilder nicht stimmen.
- Die Kartenpreise in `produkte.html` (`modelData`) und die Modelltabellen der Klassenseiten werden noch von Hand gepflegt; `scripts/test-models.mjs` prüft, dass sie mit `modelle.json` übereinstimmen. Das Zulassungs-Label im Konfigurator folgt dem zGG (bis 2.000 kg Betriebserlaubnis (CoC), darüber TÜV-EG), nicht der Achszahl.

## Änderungen veröffentlichen

Änderungen auf separatem Branch prüfen und als Pull Request vorlegen. PR-Prüfung baut und testet ohne Push oder Deployment. **Merge nach main erst nach Freigabe.** Dann generiert der vorhandene Sitemap-Workflow die Dateien erneut, committet Änderungen und fordert einen Pages-Build an. Generator- UND Pages-Ergebnis und Live-Seiten prüfen.

Voraussetzung für diesen Veröffentlichungsschritt: branchbasiertes GitHub Pages von main/root, Berechtigungen contents:write und pages:write. Der erste echte Durchlauf mit Produktseiten ist noch zu bestätigen; ein grüner lokaler Test ist kein Deployment-Nachweis.

## Später gezielt aufräumen – nicht Teil dieses PR

- Die ähnlich benannten Dateien `sitemap.yml`, `generate-sitemap.mjs`, `test-seo.mjs` im Hauptverzeichnis und `github/workflows/` sind nicht die vom aktuellen Workflow referenzierten Pfade. Nach Herkunfts-/Referenzprüfung separat bereinigen; nicht pauschal löschen.
- `files.zip` auf Zweck prüfen und Backups künftig außerhalb der veröffentlichten Website halten. Noch nicht verschoben oder gelöscht.
- Weitere gemeinsam genutzte Bilder/CSS/JS können später schrittweise unter `assets/` gesammelt werden. Bestehende öffentliche Dateien nicht ohne vollständige Pfadprüfung verschieben.
- Bestehende öffentliche Hauptseiten-URLs vorerst stabil lassen. Ordentlichere GitHub-Ordner allein rechtfertigen keine riskante URL-Umstellung.

Der bisherige ZIP-Entwurf mit Produktseiten im Hauptverzeichnis wird durch den Ordner-Entwurf ersetzt. Nicht beide Varianten mischen.
