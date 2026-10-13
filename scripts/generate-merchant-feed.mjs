// Google-Merchant-Feed nur fuer Shop-Zubehoer.
// Bootsanhaenger bleiben draussen: Abholung statt festem Versand, kein Widerruf,
// Einstiegspreis ist nicht der konfigurierte Endpreis, MadeToOrder ist kein Feed-Wert.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, BASE } from './generate-sitemap.mjs';
import { catalog, filename, unitShippingEuro } from './generate-product-pages.mjs';

const xmlEscape = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

export function renderFeed(products) {
  const e=xmlEscape;
  const items=products.map(p=>{
    const link=`${BASE}/${filename(p)}`;
    const image=`${BASE}/${p.image||p.imagePath}`;
    const description=p.desc?`${p.name}. ${p.desc}`:p.name;
    // Einzelstueck, passend zum sichtbaren Hinweis "bei Einzelbestellung".
    // Der Warenkorb summiert nicht linear (zwei Winden sind 30 EUR, nicht 60).
    const ship=unitShippingEuro(p).toFixed(2);
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
      '      <g:identifier_exists>no</g:identifier_exists>',
      '      <g:shipping>',
      '        <g:country>DE</g:country>',
      `        <g:price>${ship} EUR</g:price>`,
      '      </g:shipping>',
      '    </item>'
    ].join('\n');
  }).join('\n');
  const channelDescription='Zubehör aus dem HEKU-Shop. Bootsanhänger sind Einzelfertigung und nicht in diesem Feed.';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n  <channel>\n    <title>HEKU Shop</title>\n    <link>${BASE}/shop.html</link>\n    <description>${e(channelDescription)}</description>\n${items}\n  </channel>\n</rss>\n`;
}

export function generateFeed(root=ROOT) {
  const products=catalog(root);
  const xml=renderFeed(products);
  const target=path.join(root,'merchant-feed.xml');
  const changed=[];
  if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==xml) {
    fs.writeFileSync(target,xml);
    changed.push('merchant-feed.xml');
  }
  return {products,count:products.length,changed};
}
