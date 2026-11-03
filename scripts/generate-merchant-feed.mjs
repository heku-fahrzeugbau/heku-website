// Shop-Artikel: Versand ist calcVersand aus shop.html fuer die Menge 1.
// Bootsanhaenger B 350–B 3500: Abholung im Werk, ohne Versandpreis.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, BASE } from './generate-sitemap.mjs';
import { catalog, filename, unitShippingEuro } from './generate-product-pages.mjs';
import { models } from './generate-model-pages.mjs';
import { committedAvailabilityStarts } from './availability-starts.mjs';

const xmlEscape = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// Google: preorder, weil die Anhaenger nicht lagernd sind, sondern auf Bestellung
// gefertigt werden. availability_date ist derselbe committete Termin wie im JSON-LD.
// pickup_sla multi-week passt zu ca. 2–3 Wochen. Kein g:shipping, damit kein
// erfundener Frachtpreis im Feed steht.
export const PICKUP_LABEL = 'abholung-bielefeld';

function accessoryItem(p, root) {
  const e = xmlEscape;
  const link = `${BASE}/${filename(p)}`;
  const image = `${BASE}/${p.image||p.imagePath}`;
  const description = p.desc ? `${p.name}. ${p.desc}` : p.name;
  const ship = unitShippingEuro(p, root).toFixed(2);
  return [
    '    <item>',
    `      <title>${e(p.name)}</title>`,
    `      <link>${e(link)}</link>`,
    `      <description>${e(description)}</description>`,
    `      <g:id>${e(p.sku)}</g:id>`,
    `      <g:title>${e(p.name)}</g:title>`,
    `      <g:description>${e(description)}</g:description>`,
    `      <g:link>${e(link)}</g:link>`,
    `      <g:image_link>${e(image)}</g:image_link>`,
    '      <g:availability>in_stock</g:availability>',
    `      <g:price>${e(p.price)} EUR</g:price>`,
    '      <g:condition>new</g:condition>',
    `      <g:brand>${e(p.brand)}</g:brand>`,
    `      <g:mpn>${e(p.sku)}</g:mpn>`,
    '      <g:identifier_exists>no</g:identifier_exists>',
    '      <g:shipping>',
    '        <g:country>DE</g:country>',
    `        <g:price>${ship} EUR</g:price>`,
    '      </g:shipping>',
    '    </item>'
  ].join('\n');
}

function trailerItem(m) {
  const e = xmlEscape;
  const link = `${BASE}/${m.slug}`;
  const image = `${BASE}/${m.bilder[0].src}`;
  const id = m.name.replace(/\s+/g, '');
  const title = `HEKU ${m.name} Bootsanhänger`;
  return [
    '    <item>',
    `      <title>${e(title)}</title>`,
    `      <link>${e(link)}</link>`,
    `      <description>${e(m.description)}</description>`,
    `      <g:id>${e(id)}</g:id>`,
    `      <g:title>${e(title)}</g:title>`,
    `      <g:description>${e(m.description)}</g:description>`,
    `      <g:link>${e(link)}</g:link>`,
    `      <g:image_link>${e(image)}</g:image_link>`,
    '      <g:availability>preorder</g:availability>',
    `      <g:availability_date>${e(committedAvailabilityStarts())}</g:availability_date>`,
    `      <g:price>${e(m.preisAb)} EUR</g:price>`,
    '      <g:condition>new</g:condition>',
    '      <g:brand>HEKU</g:brand>',
    `      <g:mpn>${e(m.name)}</g:mpn>`,
    '      <g:identifier_exists>no</g:identifier_exists>',
    `      <g:shipping_label>${PICKUP_LABEL}</g:shipping_label>`,
    '      <g:pickup_sla>multi-week</g:pickup_sla>',
    '    </item>'
  ].join('\n');
}

export function renderFeed(products, trailers, root=ROOT) {
  const e = xmlEscape;
  const items = [
    ...products.map(p => accessoryItem(p, root)),
    ...trailers.filter(m => m.preisAb !== null).map(trailerItem)
  ].join('\n');
  const channelDescription = 'Shop-Artikel mit Versand in Deutschland und Bootsanhänger zur Abholung im Werk Bielefeld.';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n  <channel>\n    <title>HEKU Shop</title>\n    <link>${BASE}/shop.html</link>\n    <description>${e(channelDescription)}</description>\n${items}\n  </channel>\n</rss>\n`;
}

export function generateFeed(root=ROOT) {
  const products = catalog(root);
  const trailers = models(root);
  const xml = renderFeed(products, trailers, root);
  const target = path.join(root, 'merchant-feed.xml');
  const changed = [];
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== xml) {
    fs.writeFileSync(target, xml);
    changed.push('merchant-feed.xml');
  }
  return {products, trailers, count: products.length + trailers.filter(m => m.preisAb !== null).length, changed};
}
