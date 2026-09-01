import { ROOT, generate } from './generate-sitemap.mjs';
import { generateProducts } from './generate-product-pages.mjs';
const {products,changed}=generateProducts();
const xml=generate(ROOT,{modifiedFiles:new Set(changed),modifiedDate:new Date().toISOString().slice(0,10)});
console.log(`${products.length} Produktseiten, ${changed.length} HTML-Dateien geändert; ${(xml.match(/<url>/g)||[]).length} Sitemap-URLs.`);
