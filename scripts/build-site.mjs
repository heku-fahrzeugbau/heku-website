import { ROOT, generate } from './generate-sitemap.mjs';
import { generateProducts } from './generate-product-pages.mjs';
import { syncProductPriceTables } from './sync-product-price-tables.mjs';
const priceTables=syncProductPriceTables();
const generated=generateProducts();
const changed=[...new Set([...priceTables.changed,...generated.changed])];
const xml=generate(ROOT,{modifiedFiles:new Set(changed),modifiedDate:new Date().toISOString().slice(0,10)});
console.log(`${generated.products.length} Produktseiten, ${priceTables.managedRows} zentrale Preislisten-Zeilen, ${changed.length} HTML-Dateien geändert; ${(xml.match(/<url>/g)||[]).length} Sitemap-URLs.`);
