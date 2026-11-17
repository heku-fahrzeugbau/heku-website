import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './generate-sitemap.mjs';
import { catalog, inquiryCatalog } from './generate-product-pages.mjs';

const read = file => fs.readFileSync(path.join(ROOT,file),'utf8');
const products = catalog();
const axles = inquiryCatalog();
const shop = read('shop.html');
const contact = read('kontakt.html');

assert.equal(products.length,55,'Die 55 kaufbaren Artikel müssen unverändert bleiben.');
assert.equal(axles.length,13,'Für jedes Modell der B-Serie muss eine Achse existieren.');
assert.equal(new Set(axles.map(x=>x.id)).size,13);
assert.equal(new Set(axles.map(x=>x.code)).size,13);
assert.deepEqual(axles.filter(x=>!x.braked).map(x=>x.model),['B 350','B 500','B 750']);
assert.equal(axles.filter(x=>x.braked).length,10);
for(const axle of axles) {
  assert.equal(axle.braked,axle.desc.includes('inklusive Edelstahl Bremsseil'),axle.model);
  const card=shop.match(new RegExp(`<article class="product-card product-card-inquiry"[^>]+data-code="${axle.code}"[\\s\\S]*?</article>`))?.[0];
  assert.ok(card,`Shopkarte fehlt: ${axle.model}`);
  assert.match(card,/data-cat="achsen" data-inquiry="true"/);
  assert.match(card,/>Preis auf Anfrage<\/a>/);
  assert.doesNotMatch(card,/addToCart|product-price" value=|Warenkorb/);
  assert.ok(contact.includes(`'${axle.code}':'${axle.model}'`),`Kontakt-Vorbelegung fehlt: ${axle.model}`);
}
assert.equal((shop.match(/data-inquiry="true"/g)||[]).length,13);
assert.equal((shop.match(/<article class="product-card" id=/g)||[]).length,55);
assert.match(shop,/<option value="achsen">Achsen für Bootsanhänger<\/option>/);
assert.match(shop,/data-cat="achsen"[^>]*>Achsen für Bootsanhänger<\/button>/);
assert.match(shop,/card\.dataset\.inquiry === 'true'/);
assert.match(shop,/if \(!p \|\| p\.inquiry\) return;/);
assert.doesNotMatch(read('merchant-feed.xml'),/achse-b(?:350|500|750|900|1100|1300|1500|1800|2000|2500|2700|3000|3500)/);
for(const hub of ['ratgeber-bootsanhaenger.html','bootstrailer.html','ersatzteile-bootsanhaenger.html']) {
  assert.match(read(hub),/shop\.html\?kategorie=achsen#shopContent/);
}
assert.match(contact,/Freier Query-Text wird bewusst nicht in das Formular übernommen/);
assert.match(contact,/Ich interessiere mich für eine einzelne Achse/);

console.log('AXLE_INQUIRIES_OK');
