import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT, BASE, attributes, exclusionReason, pages } from './generate-sitemap.mjs';
import { models, generateModels, modelDataFile, faqs, expectedZulassung, GRUNDLAENGE, LAENGEN_ZUSCHLAG } from './generate-model-pages.mjs';
import { committedAvailabilityStarts } from './availability-starts.mjs';

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
  assert.equal(all.find(m => m.name === 'B 2700').maxBootslaenge, '6,60 m');
  for (const m of all) if (m.name !== 'B 2700') assert.equal(m.maxBootslaenge, null, m.name);
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
    assert.equal(o.availability, 'https://schema.org/BackOrder');
    assert.equal(o.availabilityStarts, committedAvailabilityStarts());
    assert.match(o.availabilityStarts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    assert.equal(o.url, `${BASE}/${m.slug}`);
    assert.equal(o.availableAtOrFrom.address.streetAddress, 'Bunzlauer Straße 6');
    assert.equal(o.hasMerchantReturnPolicy.returnPolicyCategory, 'https://schema.org/MerchantReturnNotPermitted');
    assert.equal(o.hasMerchantReturnPolicy.merchantReturnLink, `${BASE}/agb.html#ausschluss-einzelanfertigung`);
    assert.deepEqual(o.shippingDetails, { '@type': 'OfferShippingDetails', shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'DE' }, doesNotShip: true });
    assert.equal(o.availableDeliveryMethod, 'http://purl.org/goodrelations/v1#DeliveryModePickUp');
    for (const k of ['priceValidUntil', 'validFrom']) assert.equal(o[k], undefined, k);
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
  const corrected = ['bootstrailer.html', 'motorbootanhaenger.html', 'segelbootanhaenger.html', 'jollenanhaenger.html', 'index.html', 'faq.html', 'bootsanhaenger-nach-mass.html', 'erfahrungen.html', 'produkte.html', '100kmh-regelung.html', 'konfigurator.html'];
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
  // B 2700: bestätigter Preis ab 5.310 €. Die alten Staffeln 5.150 / 5.295 / 5.450 € bleiben draußen.
  assert.match(data, /\{name:'B 2700',price:'5\.310'/);
  assert.doesNotMatch(data, /5\.150|5\.295|5\.450/);
  assert.match(read('bootsanhaenger-b2700.html'), /Max\. Bootslänge<\/td><td><strong>6,60 m<\/strong>/);
  assert.match(read('bootsanhaenger-b2700.html'), /Die maximale Bootslänge beträgt 6,60 m/);
  const b2700 = jsonld(read('bootsanhaenger-b2700.html')).flatMap(nodes).find(n => types(n).includes('Product'));
  assert.equal(b2700.offers.price, '5310.00');
  assert.equal(b2700.additionalProperty.find(p => p.name === 'Max. Bootslänge').value, '6,60 m');
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
    for (const f of [modelDataFile, 'scripts/templates/model-page.tpl', 'produkte.html', ...all.map(m => m.slug), ...new Set(all.flatMap(m => m.bilder.flatMap(b => [b.src, b.webp].filter(Boolean))))]) fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f));
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

test('Every model page has a visible back link to the model overview on produkte.html', () => {
  assert.match(read('produkte.html'), /id="modelle"/);
  for (const m of all) {
    const html = read(m.slug);
    const links = [...html.matchAll(/<a href="([^"]+)" class="nav-back" data-back-to-overview>([^<]+)<\/a>/g)];
    assert.equal(links.length, 1, m.slug);
    assert.equal(links[0][1], 'produkte.html#modelle', m.slug);
    assert.equal(links[0][2], '&#8592; Zurück zur Modellübersicht', m.slug);
    assert.ok(html.indexOf('data-back-to-overview>') < html.indexOf('<h1'), `${m.slug}: Zurück-Link steht über der H1`);
    assert.match(html, /\.nav-back \{[^}]*font-size: 13px/, m.slug);
    assert.match(html, /history\.back\(\)/, m.slug);
  }
});

// Robin (15.10.2026): gebremste Modelle B 900–B 3500 nur in 6,60 m, keine weiteren Längenvarianten.
const lengthsIn = text => [...text.replace(/&nbsp;/g, ' ').matchAll(/(?<![\d,.])(\d{1,2},\d{1,2}) ?m\b/g)].map(x => x[1]);
const classPages = ['produkte.html', 'bootstrailer.html', 'motorbootanhaenger.html', 'segelbootanhaenger.html', 'jollenanhaenger.html', 'ratgeber-bootsanhaenger.html', 'bootsanhaenger-nach-mass.html', 'faq.html', 'index.html'];

test('Braked models list only the 6,60 m length (model pages, produkte.html, class pages)', () => {
  assert.equal(GRUNDLAENGE, '6,60 m');
  const braked = all.filter(m => m.klasse !== 'ungebremst');
  assert.deepEqual(braked.map(m => m.name), ['B 900', 'B 1100', 'B 1300', 'B 1500', 'B 1800', 'B 2000', 'B 2500', 'B 2700', 'B 3000', 'B 3500']);
  for (const m of braked) {
    assert.deepEqual(m.laengen, [{ laenge: '6,60 m', zuladung: m.zuladung, preis: m.preisAb }], m.name);
    const html = read(m.slug);
    // Erlaubt: Grundlänge 6,60 m, Lichtleiste + 1,55 m, Zuschlagsschritt 0,5 m.
    const other = lengthsIn(html).filter(l => !['6,60', '1,55', '0,5'].includes(l));
    assert.deepEqual(other, [], `${m.slug}: nur 6,60 m erlaubt`);
    assert.ok(lengthsIn(html).includes('6,60'), m.slug);
    const product = jsonld(html).flatMap(nodes).find(n => types(n).includes('Product'));
    if (m.preisAb === null) assert.equal(product, undefined, `${m.slug}: kein Product ohne Preis`);
    else assert.ok(!/\d,\d0 ?–/.test(product.description), `${m.slug}: keine Längenspanne in der Description`);
    assert.ok(!nodes(jsonld(html)).some(n => types(n).includes('ProductGroup') || n.hasVariant), `${m.slug}: keine Varianten im JSON-LD`);
  }
  const produkte = read('produkte.html');
  const data = produkte.match(/const modelData=\{[\s\S]*?\n    \};/)[0];
  for (const group of ['einachser', 'tandem']) {
    const block = data.match(new RegExp(group + ':\\[([\\s\\S]*?)\\n      \\]'))[1];
    for (const row of block.split('\n').filter(r => r.includes('{name:'))) {
      const name = row.match(/name:'([^']+)'/)[1];
      assert.match(row, /variants:\[\['6,60 m','[^']+'\]\]/, `produkte.html ${name}: genau eine Variante 6,60 m`);
      assert.deepEqual(lengthsIn(row), ['6,60'], `produkte.html ${name}`);
    }
  }
  for (const series of ['einachser', 'tandem']) {
    const section = produkte.match(new RegExp(`<section class="series" data-series="${series}">[\\s\\S]*?</section>`))[0];
    assert.deepEqual(lengthsIn(section).filter(l => !['6,60', '1,55', '0,5'].includes(l)), [], `produkte.html statisch ${series}`);
  }
  assert.doesNotMatch(produkte, /Länge über alles<\/span><strong>6,00 m/, 'B 900 steht auf 6,60 m');
  for (const f of classPages) assert.doesNotMatch(read(f), /\b(7,10|7,60|8,10|8,60) ?m\b|mehreren Längen|individuelle Rahmenlängen/, f);
  assert.match(read('motorbootanhaenger.html'), /B 900<\/div><div class="model-sub">[^<]+<\/div><\/td><td>6,60 m<\/td>/);
});

test('Length surcharge: braked single-axle +155 €, tandem +209 € per 0,5 m everywhere', () => {
  assert.deepEqual(LAENGEN_ZUSCHLAG, { einachser: 155, tandem: 209 });
  const surcharge = m => `Längere Ausführung: +${LAENGEN_ZUSCHLAG[m.klasse]} € je 0,5 m`;
  for (const m of all) {
    const html = read(m.slug).replace(/&nbsp;/g, ' ');
    const faq = faqs(m).find(f => f[0] === `Welche Länge hat der HEKU ${m.name}?`);
    if (m.klasse === 'ungebremst') { assert.equal(faq, undefined, m.name); assert.doesNotMatch(html, /je 0,5 m/, m.slug); continue; }
    assert.ok(html.includes(surcharge(m)), `${m.slug}: Zuschlagssatz sichtbar`);
    assert.ok(faq && faq[1].includes(surcharge(m)), `${m.slug}: Zuschlag in der FAQ`);
  }
  // Kein anderer Zuschlagswert irgendwo auf den Klassen-, Modell- und Ratgeberseiten oder im Konfigurator.
  for (const f of [...classPages, ...all.map(m => m.slug)]) {
    const text = read(f).replace(/&nbsp;/g, ' ');
    for (const x of text.matchAll(/\+ ?(\d+) ?€ je 0,5 m/g)) assert.ok(['155', '209'].includes(x[1]), `${f}: ${x[0]}`);
    assert.doesNotMatch(text, /je 0,5 m \+ ?(?!155|209)\d+/, f);
  }
  const data = read('produkte.html').match(/const modelData=\{[\s\S]*?\n    \};/)[0];
  for (const [group, rate] of [['einachser', 155], ['tandem', 209]]) {
    const block = data.match(new RegExp(group + ':\\[([\\s\\S]*?)\\n      \\]'))[1];
    const rows = block.split('\n').filter(r => r.includes('{name:'));
    assert.ok(rows.length >= 5, group);
    for (const row of rows) assert.match(row, new RegExp(`surcharge:${rate}\\}`), row.slice(0, 40));
  }
  assert.doesNotMatch(data.match(/ungebremst:\[[\s\S]*?\n      \]/)[0], /surcharge/);
  assert.match(read('produkte.html'), /Längere Ausführung: \+\$\{m\.surcharge\} € je 0,5 m/);
  assert.match(read('konfigurator.html'), /const laengenRate = isTandem \? 209 : 155;/);
});

test('Configurator approval follows zGG and B 2700 lists 5.310 € and 6,60 m', () => {
  const html = read('konfigurator.html');
  const start = html.indexOf('const MODELLE');
  const end = html.indexOf('const SICHERHEITSFAKTOR');
  assert.ok(start > 0 && end > start);
  const ctx = vm.runInNewContext(`${html.slice(start, end)}\n({MODELLE, zulassungLabel, angebotsPreis})`);
  const byId = id => ctx.MODELLE.find(m => m.id === id);
  assert.equal(ctx.zulassungLabel(byId('B350')), 'Betriebserlaubnis (CoC)');
  assert.equal(ctx.zulassungLabel(byId('B2000')), 'Betriebserlaubnis (CoC)');
  assert.equal(ctx.zulassungLabel(byId('B2500')), 'TÜV-EG');
  assert.equal(ctx.zulassungLabel(byId('B2700')), 'TÜV-EG');
  assert.equal(byId('B2700').preisMin, 5310);
  assert.equal(byId('B2700').maxBootslaenge, '6,60 m');
  assert.equal(ctx.angebotsPreis(byId('B2700'), 0), 'ab ca. 5.310 €');
  assert.equal(ctx.angebotsPreis(byId('B2700'), 280), 'ab ca. 5.590 €');
  assert.equal(ctx.angebotsPreis(byId('B900'), 140), 'ab ca. 3.330 €');
  assert.equal(ctx.angebotsPreis(byId('B2000'), 280), 'ab ca. 4.935 €');
  assert.match(html, /if \(!modell\.gebremst\)/);
  assert.match(html, /preis = isTandem \? 280 : 140/);
  assert.doesNotMatch(html, /KBA-Typprüfung|TÜV EG-Typgen/);
  assert.match(read('konfigurator.html'), /id="telefon"/);
  assert.match(read('konfigurator.html'), /id="strasse"/);
});
