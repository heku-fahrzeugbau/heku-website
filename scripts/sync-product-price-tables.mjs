import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './generate-sitemap.mjs';
import { catalog } from './generate-product-pages.mjs';

export const priceTableFiles = [
  'produkte.html',
  'motorbootanhaenger.html',
  'segelbootanhaenger.html'
];

const rowPattern = /<tr data-catalog-sku="(\d+)"><td class="pl-art">[^<]*<\/td><td>([\s\S]*?)<\/td><td class="pl-r pl-netto">[\s\S]*?<\/td><td class="pl-r pl-brutto">[\s\S]*?<\/td><\/tr>/g;

export function euro(value) {
  return Number(value).toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function renderManagedRow(product, label) {
  const gross = Number(product.price);
  const net = Math.round((gross / 1.19 + Number.EPSILON) * 100) / 100;
  return `<tr data-catalog-sku="${product.sku}"><td class="pl-art">${product.sku}</td><td>${label}</td><td class="pl-r pl-netto">${euro(net)} &euro;</td><td class="pl-r pl-brutto">${euro(gross)} &euro;</td></tr>`;
}

export function syncProductPriceTables(root = ROOT, products = catalog(root)) {
  const bySku = new Map(products.map(product => [product.sku, product]));
  const changed = [];
  let managedRows = 0;

  for (const file of priceTableFiles) {
    const target = path.join(root, file);
    let source = fs.readFileSync(target, 'utf8');
    const output = source.replace(rowPattern, (_, sku, label) => {
      const product = bySku.get(sku);
      if (!product) throw new Error(`Preislisten-Zeile verweist auf unbekannte Artikelnummer ${sku} in ${file}.`);
      managedRows += 1;
      return renderManagedRow(product, label);
    });
    if (source !== output) {
      fs.writeFileSync(target, output);
      changed.push(file);
    }
  }

  if (managedRows !== 6) throw new Error(`Erwartet 6 zentral gepflegte Preislisten-Zeilen, gefunden: ${managedRows}.`);
  return { changed, managedRows };
}
