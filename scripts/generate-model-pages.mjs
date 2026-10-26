// content/modelle/modelle.json is the ONLY source of the public trailer model pages
// (bootsanhaenger-b*.html) and of the generated model block on produkte.html.
// Fail-closed: invalid data or a missing image aborts the build before any file is written.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, BASE } from './generate-sitemap.mjs';
import { escapeHTML } from './generate-product-pages.mjs';
import { committedAvailabilityStarts } from './availability-starts.mjs';

export const modelDataFile = 'content/modelle/modelle.json';
export const modelTemplate = 'scripts/templates/model-page.tpl';
export const modelHub = 'produkte.html';
export const klassen = {
  ungebremst: { label: 'Ungebremste Bootsanhänger', kurz: 'Ungebremst', achsen: 'Einachser', bremse: 'ungebremst' },
  einachser: { label: 'Gebremste Einachser', kurz: 'Gebremst', achsen: 'Einachser', bremse: 'Auflaufbremse mit Rückfahrautomatik' },
  tandem: { label: 'Tandem-Bootsanhänger', kurz: 'Gebremst', achsen: 'Tandem (2 Achsen)', bremse: 'Auflaufbremse mit Rückfahrautomatik' }
};
export const zulassungLabel = { 'CoC': 'Betriebserlaubnis (CoC)', 'TÜV-EG': 'TÜV-EG' };
const ORG = BASE + '/#organization';
const kg = n => n.toLocaleString('de-DE') + ' kg';
const euro = p => Number(p).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';
const pageUrl = m => `${BASE}/${m.slug}`;
// Robin (15.10.2026): gebremste Modelle nur in 6,60 m; längere Ausführung je 0,5 m: Einachser + 155 €, Tandem + 209 €.
export const GRUNDLAENGE = '6,60 m';
export const LAENGEN_ZUSCHLAG = { einachser: 155, tandem: 209 };
export const laengenZuschlagText = m => `Längere Ausführung: +${LAENGEN_ZUSCHLAG[m.klasse]} € je 0,5 m`;

// Robins Vorgaben (15.10.2026): B 350–B 2000 CoC, ab B 2500 TÜV-EG; ungebremst Tempo 100
// serienmäßig, gebremst optional (Einachser 140 €, Tandem 280 €).
export const expectedZulassung = m => (m.zgg <= 2000 ? 'CoC' : 'TÜV-EG');
export const expectedTempo100 = m => (m.klasse === 'ungebremst' ? { serie: true } : { option: m.klasse === 'tandem' ? 280 : 140 });

export function models(root = ROOT) {
  let records;
  try { records = JSON.parse(fs.readFileSync(path.join(root, modelDataFile), 'utf8')); }
  catch (error) { throw new Error(`Modelldaten konnten nicht gelesen werden (${modelDataFile}): ${error.message}`); }
  if (!Array.isArray(records) || !records.length) throw new Error('Modelldaten müssen eine nicht-leere Liste sein.');
  const slugs = new Set();
  for (const m of records) {
    const where = `Modell ${m && m.name}`;
    if (!m || typeof m !== 'object') throw new Error('Ungültiger Modelldatensatz.');
    if (!/^B \d+$/.test(m.name || '')) throw new Error(`${where}: ungültiger Name.`);
    if (m.slug !== `bootsanhaenger-b${m.name.slice(2)}.html`) throw new Error(`${where}: Slug muss bootsanhaenger-b${m.name.slice(2)}.html sein.`);
    if (slugs.has(m.slug)) throw new Error(`${where}: doppelter Slug.`);
    slugs.add(m.slug);
    if (!klassen[m.klasse]) throw new Error(`${where}: unbekannte Klasse ${m.klasse}.`);
    if (!Number.isInteger(m.zgg) || m.zgg !== Number(m.name.slice(2))) throw new Error(`${where}: zGG passt nicht zum Modellnamen.`);
    if (!Number.isInteger(m.zuladung) || m.zuladung <= 0 || m.zuladung >= m.zgg) throw new Error(`${where}: ungültige Zuladung.`);
    if ((m.klasse === 'ungebremst') !== (m.zgg <= 750)) throw new Error(`${where}: Klasse passt nicht zum zGG.`);
    if (m.preisAb !== null && !/^\d+\.\d{2}$/.test(String(m.preisAb))) throw new Error(`${where}: ungültiger Preis ${m.preisAb}.`);
    if (m.zulassung !== expectedZulassung(m)) throw new Error(`${where}: Zulassung muss ${expectedZulassung(m)} sein.`);
    if (JSON.stringify(m.tempo100) !== JSON.stringify(expectedTempo100(m))) throw new Error(`${where}: Tempo-100-Angabe widerspricht der Regel.`);
    if (!Array.isArray(m.laengen)) throw new Error(`${where}: laengen fehlt.`);
    for (const l of m.laengen) {
      if (!/^\d,\d0 m$/.test(l.laenge || '')) throw new Error(`${where}: ungültige Länge.`);
      if (!Number.isInteger(l.zuladung)) throw new Error(`${where}: ungültige Zuladung je Länge.`);
      if (l.preis !== null && !/^\d+\.\d{2}$/.test(String(l.preis))) throw new Error(`${where}: ungültiger Längenpreis.`);
      if (m.preisAb === null && l.preis !== null) throw new Error(`${where}: Längenpreis ohne ab-Preis.`);
    }
    if (m.klasse !== 'ungebremst' && (m.laengen.length !== 1 || m.laengen[0].laenge !== GRUNDLAENGE || m.laengen[0].preis !== m.preisAb || m.laengen[0].zuladung !== m.zuladung)) throw new Error(`${where}: gebremste Modelle nur mit einer Länge (${GRUNDLAENGE}) zum ab-Preis.`);
    const prices = m.laengen.map(l => l.preis).filter(Boolean);
    if (prices.length && m.preisAb !== prices[0]) throw new Error(`${where}: ab-Preis muss dem Preis der Grundlänge entsprechen.`);
    if (!Array.isArray(m.bilder) || !m.bilder.length) throw new Error(`${where}: mindestens ein Bild nötig.`);
    for (const b of m.bilder) {
      if (!b.src || !b.alt || typeof b.beispiel !== 'boolean') throw new Error(`${where}: Bild unvollständig.`);
      if (!fs.existsSync(path.join(root, b.src))) throw new Error(`${where}: Bild fehlt: ${b.src}`);
      if (b.webp != null && (typeof b.webp !== 'string' || !b.webp.endsWith('.webp') || !fs.existsSync(path.join(root, b.webp)))) throw new Error(`${where}: WebP fehlt: ${b.webp}`);
      if ((b.width != null || b.height != null) && (!Number.isInteger(b.width) || !Number.isInteger(b.height) || b.width < 1 || b.height < 1)) throw new Error(`${where}: Bildmaße ungültig.`);
    }
    for (const key of ['title', 'h1', 'description', 'intro', 'abgrenzung']) {
      if (typeof m[key] !== 'string' || !m[key].trim()) throw new Error(`${where}: ${key} fehlt.`);
      if (/patentiert/i.test(m[key])) throw new Error(`${where}: „patentiert“ ist nicht erlaubt, „eigenentwickelt“ verwenden.`);
    }
    if (m.title.length > 60) throw new Error(`${where}: Title länger als 60 Zeichen.`);
    if (m.description.length > 160) throw new Error(`${where}: Description länger als 160 Zeichen.`);
    if (m.preisAb !== null && !m.description.includes(euro(m.preisAb))) throw new Error(`${where}: Description nennt nicht den ab-Preis.`);
    if (m.preisAb === null && (!m.description.includes('Preis auf Anfrage') || /\d[\d.]*\s*€/.test(m.description))) throw new Error(`${where}: ohne Preis nur „Preis auf Anfrage“, kein Eurobetrag in der Description.`);
    if (m.maxBootslaenge !== null && !/^\d,\d{2} m$/.test(m.maxBootslaenge)) throw new Error(`${where}: ungültige maximale Bootslänge.`);
    if (!Array.isArray(m.bootstypen) || !m.bootstypen.length) throw new Error(`${where}: bootstypen fehlt.`);
  }
  return records;
}

export function tempoText(m) {
  if (m.tempo100.serie) return `Der HEKU ${m.name} ist serienmäßig für Tempo 100 zugelassen. Ob Sie mit Ihrem Gespann tatsächlich 100 km/h fahren dürfen, hängt zusätzlich vom Zugfahrzeug ab: Bei ungebremsten Anhängern darf die zulässige Gesamtmasse des Anhängers höchstens das 0,3-Fache der Leermasse des Zugfahrzeugs betragen (Faktor 0,3). Weitere Bedingungen sind ABS/ABV am Zugfahrzeug, Reifen mit mindestens Geschwindigkeitsindex L, die jünger als sechs Jahre sind, die richtige Stützlast und die gesiegelte Tempo-100-Plakette.`;
  const art = m.klasse === 'tandem' ? 'Tandem' : 'Einachser';
  return `Tempo 100 ist beim HEKU ${m.name} optional: Für die Tempo-100-Konfiguration erhält der Anhänger ein Radstoßdämpfer-Paket für ${m.tempo100.option} € (${art}). Geben Sie den Wunsch bei der Bestellung an. Ob das Gespann 100 km/h fahren darf, hängt zusätzlich vom Masseverhältnis zum Zugfahrzeug ab (gebremst mit hydraulischen Schwingungsdämpfern Faktor 1,1, mit anerkannter Stabilisierungseinrichtung Faktor 1,2), außerdem von ABS/ABV, Reifen mit mindestens Index L, die jünger als sechs Jahre sind, der richtigen Stützlast und der gesiegelten Tempo-100-Plakette.`;
}

export function faqs(m) {
  const list = [];
  if (m.klasse === 'ungebremst') list.push([`Braucht der HEKU ${m.name} eine Bremse?`, `Nein. Der ${m.name} hat ${kg(m.zgg)} zulässiges Gesamtgewicht und ist ungebremst; bis 750 kg ist keine Bremsanlage vorgeschrieben. Die ungebremste Anhängelast Ihres Zugfahrzeugs (Feld O.2 in der Zulassungsbescheinigung Teil I) muss mindestens ${kg(m.zgg)} betragen.`]);
  else list.push([`Was bewirkt die Rückfahrautomatik am HEKU ${m.name}?`, `Die Auflaufbremse des ${m.name} hat serienmäßig eine Rückfahrautomatik. Sie löst die Bremse beim Rückwärtsfahren automatisch, etwa beim Einsetzen des Bootes an der Slipanlage.`]);
  list.push([`Welche Zulassung hat der HEKU ${m.name}?`, m.zulassung === 'CoC'
    ? `Der ${m.name} wird mit Betriebserlaubnis (CoC) geliefert. Mit diesem Dokument lassen Sie den Anhänger bei Ihrer Zulassungsstelle zu.`
    : `Der ${m.name} wird mit TÜV-EG geliefert. Bei HEKU erhalten die Modelle B 350 bis B 2000 eine Betriebserlaubnis (CoC), die Modelle ab B 2500 TÜV-EG.`]);
  list.push([`Darf ich mit dem HEKU ${m.name} 100 km/h fahren?`, m.tempo100.serie
    ? `Der ${m.name} ist serienmäßig für Tempo 100 zugelassen. Ob das Gespann 100 km/h fahren darf, hängt zusätzlich vom Zugfahrzeug ab: Faktor 0,3 der Leermasse, ABS/ABV, geeignete Reifen, richtige Stützlast und die Tempo-100-Plakette.`
    : `Tempo 100 ist beim ${m.name} optional und kostet mit dem Radstoßdämpfer-Paket ${m.tempo100.option} €. Ob das Gespann 100 km/h fahren darf, hängt zusätzlich vom Masseverhältnis zum Zugfahrzeug, ABS/ABV, geeigneten Reifen, der Stützlast und der Tempo-100-Plakette ab.`]);
  if (m.klasse !== 'ungebremst') list.push([`Welche Länge hat der HEKU ${m.name}?`, `Der ${m.name} wird in ${GRUNDLAENGE} Grundlänge gefertigt.${m.maxBootslaenge ? ` Die maximale Bootslänge beträgt ${m.maxBootslaenge}.` : ''} ${laengenZuschlagText(m)} (inkl. MwSt.).`]);
  list.push([`Wie lange dauert die Lieferung des HEKU ${m.name}?`, `Jeder HEKU-Anhänger wird auf Bestellung gefertigt, die Lieferzeit liegt bei ca. 2 Wochen. Sie holen den Anhänger im Werk Bunzlauer Str. 6, 33719 Bielefeld ab (Mo–Fr 08:00–12:30 und 13:00–16:30 Uhr). Eine Anlieferung wird separat kalkuliert.`]);
  list.push([`Kann ich den HEKU ${m.name} zurückgeben?`, `Nein. Jeder HEKU-Bootsanhänger wird nach Ihren Bootsdaten einzeln gefertigt; für Einzelanfertigungen besteht kein Widerrufsrecht. Die Einzelheiten stehen in unseren AGB.`]);
  list.push([`Wann muss der HEKU ${m.name} zur Hauptuntersuchung?`, m.klasse === 'ungebremst'
    ? `Anhänger bis 750 kg zulässiges Gesamtgewicht müssen erstmals nach 36 Monaten und danach alle 24 Monate zur Hauptuntersuchung.`
    : `Anhänger über 750 kg bis 3,5 t zulässiges Gesamtgewicht müssen alle 24 Monate zur Hauptuntersuchung.`]);
  return list;
}

const offerFor = (m, url) => ({
  '@type': 'Offer', url, price: m.preisAb, priceCurrency: 'EUR',
  itemCondition: 'https://schema.org/NewCondition',
  // Google unterstützt MadeToOrder für Händlereinträge nicht; BackOrder = jetzt bestellbar, Lieferung später.
  // HEKU: 2–3 Wochen. availabilityStarts ist der committete Termin (heute + 21 Tage, Europe/Berlin),
  // den scripts/update-availability-starts.mjs montags fortschreibt. Sichtbarer Text bleibt „ca. 2 Wochen“.
  availability: 'https://schema.org/BackOrder',
  availabilityStarts: committedAvailabilityStarts(),
  seller: { '@id': ORG },
  // Anhänger: kein Standardversand, Abholung im Werk Bielefeld (Frachtversand nur individuell vereinbart).
  shippingDetails: { '@type': 'OfferShippingDetails', shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'DE' }, doesNotShip: true },
  availableDeliveryMethod: 'http://purl.org/goodrelations/v1#DeliveryModePickUp',
  availableAtOrFrom: { '@type': 'Place', name: 'HEKU Fahrzeugbau GmbH', address: { '@type': 'PostalAddress', streetAddress: 'Bunzlauer Straße 6', addressLocality: 'Bielefeld', postalCode: '33719', addressRegion: 'Nordrhein-Westfalen', addressCountry: 'DE' } },
  hasMerchantReturnPolicy: { '@type': 'MerchantReturnPolicy', applicableCountry: 'DE', returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted', merchantReturnLink: BASE + '/agb.html#ausschluss-einzelanfertigung' }
});

export function schemaFor(m) {
  const url = pageUrl(m), k = klassen[m.klasse];
  const graph = [];
  // B 2700 und jedes andere Modell ohne bestätigten Preis: bewusst KEIN Product-Knoten.
  if (m.preisAb !== null) graph.push({
    '@type': 'Product', '@id': url + '#product', name: `HEKU ${m.name} Bootsanhänger`, model: m.name, url,
    image: m.bilder.map(b => `${BASE}/${b.src}`),
    description: m.description,
    brand: { '@type': 'Brand', name: 'HEKU' },
    manufacturer: { '@id': ORG },
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'Zulässiges Gesamtgewicht', value: m.zgg, unitCode: 'KGM' },
      { '@type': 'PropertyValue', name: 'Zuladung ca.', value: m.zuladung, unitCode: 'KGM' },
      ...(m.maxBootslaenge ? [{ '@type': 'PropertyValue', name: 'Max. Bootslänge', value: m.maxBootslaenge }] : []),
      { '@type': 'PropertyValue', name: 'Bremse', value: k.bremse },
      { '@type': 'PropertyValue', name: 'Achsen', value: k.achsen },
      { '@type': 'PropertyValue', name: 'Zulassung', value: zulassungLabel[m.zulassung] },
      { '@type': 'PropertyValue', name: 'Tempo 100', value: m.tempo100.serie ? 'serienmäßig' : `optional (+ ${m.tempo100.option} €)` }
    ],
    offers: offerFor(m, url)
  });
  graph.push({ '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'HEKU Fahrzeugbau', item: BASE + '/' },
    { '@type': 'ListItem', position: 2, name: 'Bootsanhänger', item: BASE + '/produkte.html' },
    { '@type': 'ListItem', position: 3, name: `HEKU ${m.name}`, item: url }
  ] });
  graph.push({ '@type': 'FAQPage', mainEntity: faqs(m).map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
  return { '@context': 'https://schema.org', '@graph': graph };
}

const jsonForScript = data => JSON.stringify(data, null, 2).replace(/</g, '\\u003c');

function renderBody(m, all) {
  const k = klassen[m.klasse], e = escapeHTML;
  const priceHTML = m.preisAb === null ? 'Preis auf Anfrage' : `ab ${e(euro(m.preisAb))}`;
  const idx = all.indexOf(m), neighbors = [all[idx - 1], all[idx + 1]].filter(Boolean);
  const rows = [
    ['Zulässiges Gesamtgewicht', kg(m.zgg)],
    ['Zuladung ca.', kg(m.zuladung)],
    m.laengen.length ? ['Länge', m.laengen.map(l => l.laenge).join(' / ')] : null,
    m.lichtleiste ? ['Lichtleiste', m.lichtleiste] : null,
    ['Achsen', k.achsen],
    ['Bremse', k.bremse],
    ['Zulassung', zulassungLabel[m.zulassung]],
    ['Tempo 100', m.tempo100.serie ? 'serienmäßig zugelassen' : `optional, Radstoßdämpfer-Paket + ${m.tempo100.option} €`],
    ['Leergewicht', m.leergewicht], ['Bereifung', m.bereifung], ['Max. Bootslänge', m.maxBootslaenge]
  ].filter(r => r && r[1] !== null && r[1] !== undefined);
  const variants = m.laengen.length > 1 || (m.laengen.length === 1 && m.klasse !== 'einachser') ? `
      <div class="table-wrap">
        <table class="model-table">
          <thead><tr><th>Länge</th><th>Zuladung ca.</th><th>Preis</th></tr></thead>
          <tbody>
${m.laengen.map(l => `            <tr><td><div class="model-name">${e(l.laenge)}</div></td><td>${e(kg(l.zuladung))}</td><td><div class="model-price">${l.preis ? 'ab ' + e(euro(l.preis)) : 'auf Anfrage'}</div></td></tr>`).join('\n')}
          </tbody>
        </table>
      </div>` : '';
  const laengenText = m.klasse === 'ungebremst'
    ? `<p class="body-text">Weitere Längen und Sondermaße auf Anfrage.</p>`
    : `<p class="body-text" data-length-surcharge>Grundlänge ${e(GRUNDLAENGE)}. ${e(laengenZuschlagText(m))} (inkl. MwSt.).</p>`;
  const ausstattung = m.klasse === 'ungebremst'
    ? `<ul>
          <li>Kielauflage vorne, Langauflage bzw. Polsterkissen hinten</li>
          <li>ausziehbare Beleuchtung</li>
          <li>eigenentwickelte wasserdichte Radnabe mit 5 Jahren Garantie (<a href="wasserdichte-radnabe.html">mehr zur Radnabe</a>)</li>
          <li>feuerverzinkt nach DIN 1461</li>
          <li>Betriebserlaubnis (CoC)</li>${m.zgg <= 500 ? '\n          <li>zerlegbar</li>' : ''}
        </ul>`
    : `<ul>
          <li><strong>Motorboot-Ausführung:</strong> Rückfahrautomatik, Kielrollen, Langauflagen mit Gewindespindeln, Stützrad, Windenstand mit Sicherheitswinde (horizontal und vertikal verstellbar), Einzelradfederung, 4 Verzurrösen</li>
          <li><strong>Segelboot-Ausführung:</strong> Rückfahrautomatik, Stützrad, verstellbare Bugstütze, 4 verstellbare Rumpfstützen, Kielauflage in Achshöhe, 4 Verzurrösen</li>
          <li>eigenentwickelte wasserdichte Radnabe mit 5 Jahren Garantie (<a href="wasserdichte-radnabe.html">mehr zur Radnabe</a>)</li>
          <li>feuerverzinkt nach DIN 1461</li>
          <li>${e(zulassungLabel[m.zulassung])}</li>
        </ul>`;
  const daempfer = m.klasse === 'tandem' ? 'artikel/50249.html' : 'artikel/50248.html';
  const optionen = `<ul>
          <li>Windenstände und Winden: <a href="artikel/50200.html">Art. 50200</a>, <a href="artikel/50201.html">Art. 50201</a>, <a href="artikel/50202.html">Art. 50202</a> · <a href="windenstaende-winden.html">alle Windenstände</a></li>
          <li><a href="kielrollen-stuetzrollen.html">Kiel- und Stützrollen</a> und <a href="auflagen-polsterkissen.html">Auflagen und Polsterkissen</a></li>${m.klasse === 'ungebremst' ? '' : `\n          <li>Radstoßdämpfer für die Tempo-100-Konfiguration: <a href="${daempfer}">Radstoßdämpfer ${m.klasse === 'tandem' ? 'Tandem' : '1-achsig'}</a></li>`}
          <li><a href="artikel/50234.html">Gangway</a> und <a href="weiteres-bootsanhaenger-zubehoer.html">weiteres Zubehör</a></li>
        </ul>`;
  const figures = m.bilder.map((b, i) => {
    const dims = Number.isInteger(b.width) && Number.isInteger(b.height) ? ` width="${b.width}" height="${b.height}"` : '';
    const img = `<img src="${e(b.src)}" alt="${e(b.alt)}"${dims}${i ? ' loading="lazy"' : ''}>`;
    const media = b.webp ? `<picture><source srcset="${e(b.webp)}" type="image/webp">${img}</picture>` : img;
    const caption = b.beispiel
      ? `<figcaption>Beispielfoto: Für den ${e(m.name)} liegt noch kein eigenes Foto vor. Abbildungen können Zubehör gegen Aufpreis zeigen.</figcaption>`
      : '<figcaption>Abbildungen können Zubehör gegen Aufpreis zeigen.</figcaption>';
    return `<figure class="model-figure">${media}${caption}</figure>`;
  });
  const faqHTML = faqs(m).map(([q, a]) => `        <div class="faq-item">
          <button class="faq-question" onclick="toggleFaq(this)">${e(q)}<span class="faq-icon"></span></button>
          <div class="faq-answer"><div class="faq-answer-inner">${e(a)}</div></div>
        </div>`).join('\n');
  return `  <div class="page-header">
    <div class="page-header-inner">
      <a href="produkte.html#modelle" class="nav-back" data-back-to-overview>&#8592; Zurück zur Modellübersicht</a>
      <div class="breadcrumb">
        <a href="/">HEKU</a>
        <span>&#8250;</span>
        <a href="produkte.html">Bootsanhänger</a>
        <span>&#8250;</span>
        <span>HEKU ${e(m.name)}</span>
      </div>
      <div class="page-eyebrow">${e(k.label)} · B-Serie 2026 · Made in Germany</div>
      <h1 class="page-title">${e(m.h1)}</h1>
      <p class="page-sub">${e(m.intro)}</p>
      <div class="badge-row">
        <span class="badge">${m.klasse === 'ungebremst' ? 'Ungebremst' : 'Gebremst'}</span>
        <span class="badge">${m.klasse === 'tandem' ? 'Tandem' : 'Einachser'}</span>
        <span class="badge">${e(zulassungLabel[m.zulassung])}</span>
        <span class="badge">${m.tempo100.serie ? 'Tempo 100 serienmäßig' : 'Tempo 100 optional'}</span>
      </div>
      <div class="header-cta-row">
        <a href="konfigurator.html" class="btn-hero-red">${e(m.name)} konfigurieren &#8594;</a>
        <a href="kontakt.html" class="btn-hero-ghost">Anfrage senden</a>
        <a href="tel:+49521200066" class="btn-hero-ghost">0521 200066</a>
      </div>
      <div class="page-header-stats">
        <div class="stat"><div class="stat-num" data-model-price>${priceHTML}</div><div class="stat-lbl">${m.preisAb === null ? 'Fertigung auf Bestellung' : 'inkl. 19 % MwSt., ab Werk Bielefeld'}</div></div>
        <div class="stat"><div class="stat-num">${e(m.zgg.toLocaleString('de-DE'))}<span> kg</span></div><div class="stat-lbl">zulässiges Gesamtgewicht</div></div>
        <div class="stat"><div class="stat-num">${e(m.zuladung.toLocaleString('de-DE'))}<span> kg</span></div><div class="stat-lbl">Zuladung ca.</div></div>
        <div class="stat"><div class="stat-num">ca. 2<span> Wochen</span></div><div class="stat-lbl">Lieferzeit, auf Bestellung</div></div>
      </div>
    </div>
  </div>

  <div class="content-wrap">

    <div class="model-intro">
      <div>
        <div class="sec-eyebrow">Eckdaten</div>
        <h2 class="sec-title">Technische Daten HEKU ${e(m.name)}</h2>
        <table class="comp-table">
          <tbody>
${rows.map(([a, b]) => `            <tr><td>${e(a)}</td><td><strong>${e(b)}</strong></td></tr>`).join('\n')}
          </tbody>
        </table>
        <p class="body-text" style="margin-top:16px;">Die Zuladung ist das Gesamtgewicht Ihres Bootes inklusive Motor, Tank und Ausrüstung. <a href="technik-bootsanhaenger.html">Technische Daten und Steckerbelegung</a></p>
      </div>
      <div>
${figures.join('\n')}
      </div>
    </div>

    <div class="model-section">
      <div class="sec-eyebrow">Längen und Preise</div>
      <h2 class="sec-title">Preis HEKU ${e(m.name)}: ${priceHTML}</h2>
      <p class="body-text">${m.preisAb === null ? `Den aktuellen Preis für den ${e(m.name)} nennen wir Ihnen gern auf Anfrage.` : `Grundpreis ${e(euro(m.preisAb))} inkl. 19 % MwSt., ab Werk Bielefeld.`} Jeder Anhänger wird auf Bestellung gefertigt; Auflagen, Rollen und Stützen richten sich nach Ihrem Boot.</p>${variants}
      ${laengenText}
    </div>

    <div class="model-section">
      <div class="sec-eyebrow">Passende Boote</div>
      <h2 class="sec-title">Für welche Boote eignet sich der ${e(m.name)}?</h2>
      <p class="body-text">Typische Boote auf dem ${e(m.name)}:</p>
      <ul>
${m.bootstypen.map(b => `        <li>${e(b)}</li>`).join('\n')}
      </ul>
      <p class="body-text" style="margin-top:16px;">Entscheidend ist das Gesamtgewicht des Bootes von höchstens ca. ${e(kg(m.zuladung))}. ${e(m.abgrenzung)}${m.name === 'B 1300' ? ' Für Rudervereine gibt es den <a href="ruderbootanhaenger.html">Ruderbootanhänger auf Basis B 1300</a>.' : ''}</p>
    </div>

    <div class="model-section">
      <div class="sec-eyebrow">Ausstattung</div>
      <h2 class="sec-title">Serienausstattung und Optionen</h2>
      <p class="body-text"><strong>Serienmäßig:</strong></p>
      ${ausstattung}
      <p class="body-text" style="margin-top:16px;"><strong>Optionen und Zubehör:</strong></p>
      ${optionen}
    </div>

    <div class="model-section">
      <div class="sec-eyebrow">Tempo 100</div>
      <h2 class="sec-title">${m.tempo100.serie ? 'Tempo 100 serienmäßig' : 'Tempo 100 optional'}</h2>
      <p class="body-text">${e(tempoText(m))} <a href="100kmh-regelung.html">Alle Regeln zur 100-km/h-Zulassung</a></p>
    </div>

    <div class="model-section">
      <div class="sec-eyebrow">Fertigung, Lieferung, Abholung</div>
      <h2 class="sec-title">Auf Bestellung gefertigt in Bielefeld</h2>
      <p class="body-text">Der ${e(m.name)} wird nach Ihren Bootsdaten im Werk Bielefeld gefertigt und ist nach ca. 2 Wochen abholbereit. Abholung: HEKU Fahrzeugbau GmbH, Bunzlauer Str. 6, 33719 Bielefeld, Mo–Fr 08:00–12:30 und 13:00–16:30 Uhr. Eine Anlieferung wird separat kalkuliert. Für Einzelanfertigungen besteht kein Widerrufsrecht (<a href="agb.html#ausschluss-einzelanfertigung">AGB</a>).</p>
    </div>

    <div class="model-section">
      <div class="sec-eyebrow">Recht kurz</div>
      <h2 class="sec-title">Führerschein, Zulassung, HU</h2>
      <p class="body-text">Welche Fahrerlaubnis Sie für das Gespann brauchen, erklärt der Ratgeber <a href="fuehrerschein.html">Führerschein für Bootsanhänger</a>. Zur Zulassung mit ${e(zulassungLabel[m.zulassung])}: <a href="zulassung.html">Bootsanhänger zulassen</a>. ${m.klasse === 'ungebremst' ? 'Hauptuntersuchung: erstmals nach 36 Monaten, danach alle 24 Monate.' : 'Hauptuntersuchung: alle 24 Monate.'} Mehr dazu: <a href="tuev-bootsanhaenger.html">TÜV und HU für Bootsanhänger</a>.</p>
    </div>

    <div class="faq-section">
      <div class="sec-eyebrow">FAQ</div>
      <h2 class="sec-title">Häufige Fragen zum HEKU ${e(m.name)}</h2>
      <div class="faq-grid">
${faqHTML}
      </div>
    </div>

    <div class="internal-links">
      <div class="internal-links-title">Nachbarmodelle und Übersicht</div>
      <div class="link-list">
${neighbors.map(n => `        <a href="${n.slug}" class="link-pill">HEKU ${e(n.name)} &#8594;</a>`).join('\n')}
        <a href="produkte.html" class="link-pill">Alle Modelle der B-Serie &#8594;</a>
        <a href="100kmh-regelung.html" class="link-pill">100 km/h Regelung &#8594;</a>
        <a href="technik-bootsanhaenger.html" class="link-pill">Technische Daten &#8594;</a>
      </div>
    </div>

    <div class="cta-banner">
      <div class="cta-title">HEKU ${e(m.name)} anfragen</div>
      <p class="cta-sub">Bootsdaten in den Konfigurator eingeben oder direkt anrufen: 0521 200066.</p>
      <a href="konfigurator.html" class="btn-cta">Zum Konfigurator &#8594;</a>
      <a href="kontakt.html" class="btn-cta" style="margin-left:10px;">Anfrage senden</a>
    </div>

  </div><!-- end content-wrap -->`;
}

export function renderModelPage(m, all, shell) {
  const body = renderBody(m, all);
  if (/\b(?:null|undefined|NaN)\b|k\. A\./.test(body)) throw new Error(`${m.slug}: leere Angabe im HTML.`);
  const fill = { TITLE: escapeHTML(m.title), DESCRIPTION: escapeHTML(m.description), CANONICAL: pageUrl(m), OG_IMAGE: `${BASE}/${m.bilder[0].src}`, JSONLD: jsonForScript(schemaFor(m)), BODY: body };
  const html = shell.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
    if (!(key in fill)) throw new Error(`Unbekannter Platzhalter {{${key}}} in ${modelTemplate}.`);
    return fill[key];
  });
  return html;
}

export function renderHubBlock(all) {
  const groups = Object.entries(klassen).map(([key, k]) => {
    const items = all.filter(m => m.klasse === key).map(m => `<li><a href="${m.slug}">HEKU ${escapeHTML(m.name)}</a> — ${escapeHTML(kg(m.zgg))} zGG, ${m.preisAb === null ? 'Preis auf Anfrage' : 'ab ' + escapeHTML(euro(m.preisAb))}</li>`).join('');
    return `<h3>${escapeHTML(k.label)}</h3><ul>${items}</ul>`;
  }).join('');
  return `<section class="category-hub" id="modellseiten"><h2>Alle Modelle der B-Serie im Detail</h2>${groups}</section>`;
}

export function renderHubSchema(all) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'ItemList', '@id': BASE + '/produkte.html#modelle', name: 'HEKU B-Serie Bootsanhänger', numberOfItems: all.length,
        itemListElement: all.map((m, i) => ({ '@type': 'ListItem', position: i + 1, name: `HEKU ${m.name}`, url: pageUrl(m) })) },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'HEKU Fahrzeugbau', item: BASE + '/' },
        { '@type': 'ListItem', position: 2, name: 'Bootsanhänger', item: BASE + '/produkte.html' }
      ] }
    ]
  };
}

export function generateModels(root = ROOT) {
  const all = models(root);
  const shell = fs.readFileSync(path.join(root, modelTemplate), 'utf8');
  const planned = new Map(all.map(m => [m.slug, renderModelPage(m, all, shell)]));
  const orphans = fs.readdirSync(root).filter(f => /^bootsanhaenger-b\d+\.html$/.test(f) && !planned.has(f));
  if (orphans.length) throw new Error('Modellseiten ohne Datensatz: ' + orphans.join(', ') + '. Alte URLs zuerst bewusst stilllegen/weiterleiten; kein automatisches Löschen.');
  const original = fs.readFileSync(path.join(root, modelHub), 'utf8');
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  let hub = original
    .replace(/[ \t]*<!-- generated-model-links -->[\s\S]*?<!-- \/generated-model-links -->\r?\n/g, '')
    .replace(/[ \t]*<!-- generated-model-jsonld -->[\s\S]*?<!-- \/generated-model-jsonld -->\r?\n/g, '');
  const linkAnchor = '    <section class="config-strip"', headAnchor = '  <link rel="stylesheet" href="/assets/css/fonts.css">';
  if (!hub.includes(linkAnchor) || !hub.includes(headAnchor)) throw new Error(`Kein Einfügepunkt für den Modellblock in ${modelHub}.`);
  hub = hub.replace(linkAnchor, ['    <!-- generated-model-links -->', '    ' + renderHubBlock(all), '    <!-- /generated-model-links -->', ''].join(eol) + linkAnchor);
  hub = hub.replace(headAnchor, ['  <!-- generated-model-jsonld -->', '  <script type="application/ld+json">', jsonForScript(renderHubSchema(all)).replace(/\n/g, eol), '  </script>', '  <!-- /generated-model-jsonld -->', ''].join(eol) + headAnchor);
  planned.set(modelHub, hub);
  const changed = [];
  for (const [file, content] of planned) {
    const target = path.join(root, file);
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== content) { fs.writeFileSync(target, content); changed.push(file); }
  }
  return { models: all, changed };
}
