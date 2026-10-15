import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, BASE, attributes, exclusionReason, pages } from './generate-sitemap.mjs';
import { models, generateModels, modelDataFile, faqs, expectedZulassung } from './generate-model-pages.mjs';

const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const all = models();
const jsonld = html => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
const nodes = data => { const out = [], stack = [data]; while (stack.length) { const n = stack.pop(); if (!n || typeof n !== 'object') continue; if (Array.isArray(n)) { stack.push(...n); continue; } out.push(n); for (const v of Object.values(n)) if (v && typeof v === 'object') stack.push(v); } return out; };
const types = n => [].concat(n['@type'] || []);
const visibleText = html => html.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ');
const de = p => Number(p).toLocaleString('de-DE');

// Robins bestätigte ab-Preise (15.10.2026) plus die in allen Quellen identischen Site-Preise B 1300/1500/1800.
const confirmed = { 'B 350': '1375.00', 'B 500': '1575.00', 'B 750': '1995.00', 'B 900': '3190.00', 'B 1100': '3390.00', 'B 1300': '3590.00', 'B 1500': '3850.00', 'B 1800': '3995.00', 'B 2000': '4655.00', 'B 2500': '5110.00', 'B 2700': '5310.00', 'B 3000': '5855.00', 'B 3500': '6555.00' };

test('Model data: 13 models, unique slugs, valid prices, existing images', () => {
  assert.equal(all.length, 13);
  assert.deepEqual(all.map(m => m.name), Object.keys(confirmed));
  assert.equal(new Set(all.map(m => m.slug)).size, 13);
  for (const m of all) {
    assert.equal(m.preisAb, confirmed[m.name], m.name);
    if (m.preisAb !== null) assert.match(m.preisAb, /^\d+\.\d{2}$/);
    for (const b of m.bilder) assert.ok(fs.existsSync(path.join(ROOT, b.src)), b.src);
  }
  assert.deepEqual(all.filter(m => m.preisAb === null).map(m => m.name), []);
});

test('Every model page is generated, indexable, unique and in the sitemap', () => {
  const sitemap = read('sitemap.xml'), titles = new Set(), descs = new Set();
  for (const m of all) {
    const html = read(m.slug);
    assert.equal((html.match(/<h1\b/g) || []).length, 1, m.slug);
    const title = html.match(/<title>([^<]+)<\/title>/)[1], desc = html.match(/<meta name="description" content="([^"]+)">/)[1];
    assert.ok(title.length <= 60 + 10, m.slug); // escaped entities may lengthen raw HTML slightly
    assert.ok(!titles.has(title) && !descs.has(desc), m.slug); titles.add(title); descs.add(desc);
    assert.ok(html.includes(`<link rel="canonical" href="${BASE}/${m.slug}">`), m.slug);
    assert.equal(exclusionReason(m.slug, html), null, m.slug);
    assert.ok(pages().includes(m.slug), m.slug);
    assert.ok(sitemap.includes(`<loc>${BASE}/${m.slug}</loc>`), m.slug);
    assert.ok(html.includes('src="/heku-consent-v2.js?v=20261009-ga4"'), m.slug);
  }
  for (const other of ['produkte.html', 'bootstrailer.html']) assert.ok(!titles.has(read(other).match(/<title>([^<]+)<\/title>/)[1]));
});

test('Visible price, meta description and Offer agree; a model without price gets no Product', () => {
  for (const m of all) {
    const html = read(m.slug), graph = jsonld(html).flatMap(nodes);
    const products = graph.filter(n => types(n).includes('Product')), offers = graph.filter(n => types(n).includes('Offer') || types(n).includes('AggregateOffer'));
    const shown = html.match(/<div class="stat-num" data-model-price>([^<]+)<\/div>/)[1];
    if (m.preisAb === null) {
      assert.equal(products.length, 0, m.slug); assert.equal(offers.length, 0, m.slug);
      assert.equal(shown, 'Preis auf Anfrage');
      assert.doesNotMatch(visibleText(html), /ab \d\.\d{3} €/, m.slug);
      continue;
    }
    assert.equal(shown, `ab ${de(m.preisAb)} €`, m.slug);
    assert.ok(html.match(/<meta name="description" content="([^"]+)">/)[1].includes(`${de(m.preisAb)} €`), m.slug);
    assert.equal(products.length, 1, m.slug); assert.equal(offers.length, 1, m.slug);
    const [p] = products, [o] = offers;
    assert.equal(p['@id'], `${BASE}/${m.slug}#product`);
    assert.equal(o.price, m.preisAb); assert.equal(o.priceCurrency, 'EUR');
    assert.equal(o.availability, 'https://schema.org/MadeToOrder');
    assert.equal(o.url, `${BASE}/${m.slug}`);
    assert.equal(o.availableAtOrFrom.address.streetAddress, 'Bunzlauer Straße 6');
    assert.equal(o.hasMerchantReturnPolicy.returnPolicyCategory, 'https://schema.org/MerchantReturnNotPermitted');
    assert.equal(o.hasMerchantReturnPolicy.merchantReturnLink, `${BASE}/agb.html#ausschluss-einzelanfertigung`);
    for (const k of ['shippingDetails', 'priceValidUntil', 'validFrom']) assert.equal(o[k], undefined, k);
    for (const img of [].concat(p.image)) assert.match(img, /^https:\/\/heku-fahrzeugbau\.de\//);
  }
});

test('Breadcrumb has three levels and FAQPage equals the visible FAQ', () => {
  for (const m of all) {
    const html = read(m.slug), graph = jsonld(html)[0]['@graph'];
    const crumbs = graph.find(n => n['@type'] === 'BreadcrumbList').itemListElement;
    assert.deepEqual(crumbs.map(c => c.item), [`${BASE}/`, `${BASE}/produkte.html`, `${BASE}/${m.slug}`]);
    const faq = graph.find(n => n['@type'] === 'FAQPage');
    const visible = [...html.matchAll(/<button class="faq-question" onclick="toggleFaq\(this\)">([^<]+)<span class="faq-icon"><\/span><\/button>\s*<div class="faq-answer"><div class="faq-answer-inner">([^<]+)<\/div>/g)];
    const unescape = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    assert.deepEqual(faq.mainEntity.map(q => q.name), visible.map(v => unescape(v[1])), m.slug);
    assert.deepEqual(faq.mainEntity.map(q => q.acceptedAnswer.text), visible.map(v => unescape(v[2])), m.slug);
    assert.deepEqual(faq.mainEntity.map(q => q.name), faqs(m).map(f => f[0]));
  }
});

test('Registration follows Robin: B 350–B 2000 CoC, from B 2500 TÜV-EG', () => {
  for (const m of all) {
    const text = visibleText(read(m.slug));
    if (m.zgg <= 2000) { assert.match(text, /Betriebserlaubnis \(CoC\)/, m.slug); assert.doesNotMatch(text, /TÜV-EG|KBA/, m.slug); }
    else { assert.match(text, /TÜV-EG/, m.slug); assert.equal(m.zulassung, 'TÜV-EG'); }
    assert.equal(m.zulassung, expectedZulassung(m));
  }
  const corrected = ['bootstrailer.html', 'motorbootanhaenger.html', 'segelbootanhaenger.html', 'jollenanhaenger.html', 'index.html', 'faq.html', 'bootsanhaenger-nach-mass.html', 'erfahrungen.html', 'produkte.html', '100kmh-regelung.html'];
  for (const file of corrected) assert.doesNotMatch(read(file), /KBA-Typprüfung|KBA-Zulassung|KBA-zugelassen|TÜV-Einzelabnahme|T&Uuml;V-Einzelabnahme|TÜV EG-Typgenehmigung|Ungebremst · KBA|Einachsig · TÜV EG/, file);
  assert.doesNotMatch(read('ratgeber-bootsanhaenger.html'), /<td>KBA-Typprüfung<\/td>/);
  for (const file of ['bootstrailer.html', 'motorbootanhaenger.html', 'segelbootanhaenger.html', 'jollenanhaenger.html']) {
    for (const row of read(file).matchAll(/<tr[^>]*>(?:(?!<\/tr>)[\s\S])*?class="model-name">B (\d+)<(?:(?!<\/tr>)[\s\S])*?<\/tr>/g)) {
      const tag = row[0].match(/class="tag-(?:ung|ein|tan)">([^<]+)</);
      if (!tag) continue;
      assert.match(tag[1], Number(row[1]) <= 2000 ? /· CoC$/ : /· TÜV-EG$/, `${file} B ${row[1]}`);
    }
  }
  const data = read('produkte.html').match(/const modelData=\{[\s\S]*?\n    \};/)[0];
  for (const m of all) {
    const row = data.match(new RegExp(`\\{name:'${m.name}',[^\\n]*?approval:'([^']+)',page:'([^']+)'`));
    assert.ok(row, m.name); assert.equal(row[1], m.zulassung, m.name); assert.equal(row[2], m.slug, m.name);
  }
});

test('Tempo 100 follows Robin: unbraked standard, braked optional 140 € / 280 €', () => {
  for (const m of all) {
    const text = visibleText(read(m.slug));
    if (m.klasse === 'ungebremst') { assert.match(text, /serienmäßig für Tempo 100 zugelassen/, m.slug); assert.match(text, /Faktor 0,3/, m.slug); }
    else if (m.klasse === 'einachser') { assert.match(text, /Radstoßdämpfer-Paket für 140 €/, m.slug); assert.ok(read(m.slug).includes('href="artikel/50248.html"'), m.slug); }
    else { assert.match(text, /Radstoßdämpfer-Paket für 280 €/, m.slug); assert.ok(read(m.slug).includes('href="artikel/50249.html"'), m.slug); }
  }
  const tempo = read('100kmh-regelung.html');
  const box = tempo.slice(tempo.indexOf('id="kurzantwort"'), tempo.indexOf('class="lead-text"'));
  assert.match(box, /Ungebremste HEKU-Anhänger \(B 350, B 500, B 750\) sind serienmäßig für Tempo 100 zugelassen/);
  assert.doesNotMatch(box, /\d+\s*€/);
  assert.match(tempo, /Einachser \(B 900 bis B 1800\) \+ 140 €/);
  assert.match(tempo, /Tandem \(B 2000 bis B 3500\) \+ 280 €/);
  for (const file of ['bootstrailer.html', 'bootsanhaenger-nach-mass.html']) assert.doesNotMatch(read(file), /100-km\/h-Zulassung ist für Tandem-Modelle erhältlich/, file);
});

test('Prices agree across modelle.json, produkte.html and the class tables; no 3.490 € for B 1100', () => {
  const data = read('produkte.html').match(/const modelData=\{[\s\S]*?\n    \};/)[0];
  for (const m of all) {
    if (m.preisAb === null) continue;
    assert.ok(data.includes(`{name:'${m.name}',price:'${de(m.preisAb)}'`), m.name);
    for (const file of ['bootstrailer.html', 'motorbootanhaenger.html', 'segelbootanhaenger.html', 'jollenanhaenger.html']) {
      const rows = [...read(file).matchAll(new RegExp(`class="model-name">${m.name}</div>(?:(?!</tr>)[\\s\\S])*?ab (\\d\\.\\d{3})`, 'g'))].map(r => r[1]);
      if (rows.length) assert.ok(rows.includes(de(m.preisAb)), `${file} ${m.name}: ${rows}`);
    }
  }
  assert.doesNotMatch(data, /name:'B 1100',price:'3\.490'/);
  // Robins Tandem-Preisliste: B 2700 = 5.310 € (Art. 55533); die alten Werte 5.150/5.295/5.450 € dürfen nicht mehr auftauchen.
  assert.doesNotMatch(data, /name:'B 2700',price:'5\.150'|5\.295 €|5\.450 €/);
  assert.doesNotMatch(read('bootsanhaenger-b2700.html'), /5\.150 €/);
  for (const file of ['produkte.html', ...all.map(m => m.slug)]) assert.doesNotMatch(read(file), /3\.490/, file);
});

test('produkte.html links all model pages statically and carries only an ItemList summary', () => {
  const html = read('produkte.html'), outside = visibleText(html);
  for (const m of all) assert.ok(outside.includes(`href="${m.slug}"`), m.slug);
  assert.doesNotMatch(html, /href="#">Details ansehen/);
  assert.doesNotMatch(html, /UNgebremst/);
  const graph = jsonld(html).flatMap(nodes);
  assert.equal(graph.filter(n => types(n).includes('Product')).length, 0);
  const list = graph.find(n => types(n).includes('ItemList'));
  assert.equal(list.numberOfItems, 13); assert.deepEqual(list.itemListElement.map(i => i.url), all.map(m => `${BASE}/${m.slug}`));
});

test('Compliance and links on every model page', () => {
  for (const m of all) {
    const html = read(m.slug);
    assert.doesNotMatch(html, /patentiert/i, m.slug);
    assert.doesNotMatch(visibleText(html), /(?:\+49|\b0)\s*1[5-7]\d/, m.slug);
    assert.ok(html.includes('tel:+49521200066') && html.includes('0521 200066'), m.slug);
    for (const needle of ['eigenentwickelt', 'ca. 2 Wochen', 'Bunzlauer Str']) assert.ok(html.includes(needle), `${m.slug} ${needle}`);
    for (const href of ['technik-bootsanhaenger.html', 'konfigurator.html', 'kontakt.html', 'produkte.html', '100kmh-regelung.html', 'agb.html#ausschluss-einzelanfertigung']) assert.ok(html.includes(`href="${href}"`), `${m.slug} ${href}`);
    for (const tag of html.matchAll(/<(?:a|img)\b[^>]*>/gi)) {
      const a = attributes(tag[0]), url = a.href || a.src;
      if (!url || /^(?:https?:|mailto:|tel:|#)/.test(url)) continue;
      const local = decodeURIComponent(url.split(/[?#]/)[0]).replace(/^\//, '') || 'index.html';
      assert.ok(fs.existsSync(path.join(ROOT, local)), `${m.slug}: ${url}`);
    }
  }
  assert.ok(read('bootsanhaenger-b1300.html').includes('href="ruderbootanhaenger.html"'));
  assert.ok(!read('merchant-feed.xml').includes('bootsanhaenger-b'));
});

test('Generator is idempotent, fails closed and updates only the changed model', () => {
  assert.deepEqual(generateModels().changed, []);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'heku-models-'));
  try {
    for (const dir of ['content/modelle', 'scripts/templates', 'assets/anhaenger']) fs.mkdirSync(path.join(tmp, dir), { recursive: true });
    for (const f of [modelDataFile, 'scripts/templates/model-page.tpl', 'produkte.html', ...all.map(m => m.slug), ...new Set(all.flatMap(m => m.bilder.map(b => b.src)))]) fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f));
    assert.deepEqual(generateModels(tmp).changed, []);
    const data = JSON.parse(fs.readFileSync(path.join(tmp, modelDataFile), 'utf8'));
    const b750 = data.find(m => m.name === 'B 750');
    b750.preisAb = '2015.00'; b750.laengen[0].preis = '2015.00'; b750.description = b750.description.replace('1.995 €', '2.015 €');
    fs.writeFileSync(path.join(tmp, modelDataFile), JSON.stringify(data));
    assert.deepEqual(generateModels(tmp).changed.sort(), ['bootsanhaenger-b750.html', 'produkte.html']);
    assert.match(fs.readFileSync(path.join(tmp, 'bootsanhaenger-b750.html'), 'utf8'), /"price": "2015.00"/);
    const broken = structuredClone(data); broken.find(m => m.name === 'B 2500').zulassung = 'CoC';
    fs.writeFileSync(path.join(tmp, modelDataFile), JSON.stringify(broken));
    assert.throws(() => generateModels(tmp), /Zulassung/);
    const badTempo = structuredClone(data); badTempo.find(m => m.name === 'B 900').tempo100 = { serie: true };
    fs.writeFileSync(path.join(tmp, modelDataFile), JSON.stringify(badTempo));
    assert.throws(() => generateModels(tmp), /Tempo-100/);
    const badPrice = structuredClone(data); badPrice[0].preisAb = '1.375';
    fs.writeFileSync(path.join(tmp, modelDataFile), JSON.stringify(badPrice));
    assert.throws(() => generateModels(tmp), /Preis/);
    const noImage = structuredClone(data); noImage[0].bilder[0].src = 'assets/anhaenger/fehlt.jpg';
    fs.writeFileSync(path.join(tmp, modelDataFile), JSON.stringify(noImage));
    assert.throws(() => generateModels(tmp), /Bild fehlt/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
