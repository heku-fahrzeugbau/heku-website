// content/produkte/produkte.json is the ONLY source of public product data.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT, BASE } from './generate-sitemap.mjs';

export const categories = {
  winden: ['windenstaende-winden.html', 'Windenstände & Winden'],
  stuetzraeder: ['stuetzraeder-bootsanhaenger.html', 'Stützräder'],
  rollen: ['kielrollen-stuetzrollen.html', 'Kiel- & Stützrollen'],
  auflagen: ['auflagen-polsterkissen.html', 'Auflagen & Kissen'],
  raeder: ['raeder-reifen-bootsanhaenger.html', 'Räder & Reifen'],
  beleuchtung: ['beleuchtung-bootsanhaenger.html', 'Beleuchtung'],
  sonstiges: ['weiteres-bootsanhaenger-zubehoer.html', 'Weiteres Zubehör']
};
// Verified HEKU-logo placeholder, not a product photograph. A replacement photo
// gets a different hash automatically, including when its filename stays the same.
export const placeholderHash = '0264856e2beb5e286d719e2520c0897f8a607620f1ee8873a24d1242999ddde8';
export const productDataFile = 'content/produkte/produkte.json';
export const filename = p => `artikel/${p.sku}.html`;
export const escapeHTML = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
export function plain(s) {
  if (/<[^>]+>/.test(s)) throw new Error('Produkttext muss Klartext sein, kein HTML.');
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_,e) => {
    if(e[0]==='#') return String.fromCodePoint(e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):Number(e.slice(1)));
    return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[e.toLowerCase()];
  }).trim();
}
export function catalog(root=ROOT) {
  const source=path.join(root,productDataFile);
  let records;
  try { records=JSON.parse(fs.readFileSync(source,'utf8')); }
  catch(error) { throw new Error(`Produktdaten konnten nicht gelesen werden (${productDataFile}): ${error.message}`); }
  if(!Array.isArray(records)||!records.length) throw new Error('Produktdaten müssen eine nicht-leere Liste sein.');
  const seen=new Set(), ids=new Set();
  return records.map((record,index)=>{
    if(!record||typeof record!=='object'||Array.isArray(record)) throw new Error(`Ungültiger Produktdatensatz an Position ${index+1}.`);
    const id=String(record.id??''), sku=String(record.sku??''), category=String(record.category??'');
    if(!/^\d+$/.test(sku)||!/^\d+$/.test(id)||!categories[category]||seen.has(sku)||ids.has(id)) throw new Error('Ungültige/doppelte Artikelnummer, ID oder Kategorie: '+sku);
    seen.add(sku); ids.add(id);
    if(typeof record.name!=='string'||typeof record.description!=='string'||typeof record.price!=='string'||typeof record.image!=='string') throw new Error('Produktfelder haben einen ungültigen Datentyp: '+sku);
    const name=plain(record.name??''), desc=plain(record.description??''), price=String(record.price??''), src=String(record.image??'');
    if(!name||!/^\d+\.\d{2}$/.test(price)||Number(price)<=0) throw new Error('Fehlender Name oder ungültiger Preis: '+sku);
    const priceText=Number(price).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
    if(!new RegExp(`^assets/produkte/produkt-${id}\\.(jpg|jpeg|png|webp)$`,'i').test(src)||!fs.existsSync(path.join(root,src))) throw new Error('Ungültiges/fehlendes Artikelbild: '+sku);
    const hash=createHash('sha256').update(fs.readFileSync(path.join(root,src))).digest('hex');
    return {id,sku,category,name,desc,price,priceText,imagePath:src,image:hash===placeholderHash?null:src};
  });
}
const cardCategoryLabels = {winden:'Winden & Ständer',stuetzraeder:'Stützräder',rollen:'Kiel- & Stützrollen',auflagen:'Auflagen & Kissen',raeder:'Räder & Reifen',sonstiges:'Sonstiges',beleuchtung:'Beleuchtung'};
export function renderProductCard(p) {
  const e=escapeHTML;
  return `      <article class="product-card" id="artikel-${p.id}" data-id="${p.id}" data-artnr="${p.sku}" data-cat="${p.category}">
        <div class="product-img"><img src="${e(p.imagePath)}" alt="${e(p.name)}" loading="lazy" decoding="async"></div>
        <div class="product-body">
          <p class="product-cat">${e(cardCategoryLabels[p.category])} <span class="product-artnr">Art. ${p.sku}</span></p>
          <h2 class="product-name">${e(p.name)}</h2>
          <p class="product-desc">${e(p.desc)}</p>
          <!-- product-detail-link --><a class="product-details-link" href="${filename(p)}" aria-label="Details: ${e(p.name)} – Art. ${p.sku}">Artikeldetails ansehen</a><!-- /product-detail-link -->
          <div class="product-footer">
            <data class="product-price" value="${p.price}">${e(p.priceText)}</data>
            <button type="button" class="btn-add" id="btn-${p.id}" onclick="addToCart(${p.id})" aria-label="${e(p.name)} – Art. ${p.sku} in den Warenkorb" disabled>+ Warenkorb</button>
          </div>
        </div>
      </article>`;
}
const json = value => JSON.stringify(value).replace(/</g,'\\u003c');
export function renderProduct(p, all, shell) {
  const e=escapeHTML, [guide,categoryName]=categories[p.category], url=BASE+'/'+filename(p);
  const title=`${p.name} – Art. ${p.sku} | HEKU`;
  const description=`${p.name}${p.desc?' – '+p.desc:''}. Art. ${p.sku}: ${p.priceText} inkl. MwSt., zzgl. Versandkosten. Im HEKU-Shop auswählen.`;
  const shop=`shop.html?artikel=${p.sku}#shopContent`;
  const product={'@type':'Product','@id':url+'#product',url,name:p.name,sku:p.sku,...(p.desc?{description:p.desc}:{}),...(p.image?{image:[BASE+'/'+p.image]}:{}),offers:{'@type':'Offer',url,price:p.price,priceCurrency:'EUR'}};
  const schema={'@context':'https://schema.org','@graph':[product,{'@type':'BreadcrumbList',itemListElement:[['HEKU',BASE+'/'],['Shop',BASE+'/shop.html'],[categoryName,BASE+'/'+guide],[p.name,url]].map(([name,item],i)=>({'@type':'ListItem',position:i+1,name,item}))}]};
  const related=all.filter(x=>x.category===p.category&&x.sku!==p.sku).slice(0,3);
  const main=`<main id="articleContent" class="detail-main">
    <div class="detail-breadcrumb" role="navigation" aria-label="Brotkrümelnavigation"><a href="/">HEKU</a><span aria-hidden="true">/</span><a href="shop.html">Shop</a><span aria-hidden="true">/</span><a href="${guide}">${e(categoryName)}</a><span aria-hidden="true">/</span><span aria-current="page">Art. ${p.sku}</span></div>
    <section class="detail-hero ${p.image?'has-photo':'no-photo'}" aria-labelledby="articleTitle">
      <div class="detail-info"><h1 id="articleTitle">${e(p.name)}</h1><p class="detail-sku">Artikelnummer ${p.sku}</p>
        ${p.desc?`<p class="detail-description">${e(p.desc)}</p>`:''}
        <div class="detail-purchase"><p class="detail-price"><data value="${p.price}">${e(p.priceText)}</data></p><p class="detail-tax">Inkl. 19 % MwSt., zzgl. Versandkosten.</p><a class="detail-buy" href="${shop}">Im Shop bestellen</a><p class="detail-handoff">Öffnet diesen Artikel im Shop. Menge und Versandkosten sehen Sie im Warenkorb.</p></div>
        ${!p.image?'<p class="detail-missing-photo">Für diesen Artikel ist derzeit kein Produktfoto hinterlegt.</p>':''}
      </div>
      ${p.image?`<figure class="detail-photo"><img src="${e(p.image)}" alt="${e(p.name)} – Art. ${p.sku}" decoding="async" fetchpriority="high"><figcaption>Artikel ${p.sku} aus dem HEKU-Shop.</figcaption></figure>`:''}
    </section>
    <section class="detail-help" aria-labelledby="fitTitle"><div><h2 id="fitTitle">Passt der Artikel zu Ihrem Anhänger?</h2><p>Wenn Sie bei der Zuordnung unsicher sind, nennen Sie uns die Artikelnummer ${p.sku} und die Bezeichnung Ihres Anhängers. Fotos der vorhandenen Baugruppe helfen bei der Anfrage.</p></div><div class="detail-help-links"><a href="kontakt.html">Zuordnung mit HEKU klären</a><a href="tel:+49521200066">0521 200066</a><a href="${guide}">Auswahlhilfe: ${e(categoryName)}</a></div></section>
    ${related.length?`<section class="detail-related"><h2>Weitere Artikel dieser Kategorie</h2><ul>${related.map(x=>`<li><a href="${filename(x)}"><span>${e(x.name)}</span><span class="detail-related-sku">Art. ${x.sku}${x.desc?' · '+e(x.desc):''}</span></a></li>`).join('')}</ul><a class="detail-all" href="${guide}#kategorie-artikel">Alle Artikel: ${e(categoryName)}</a></section>`:''}
  </main>`;
  const head=`<title>${e(title)}</title>
  <meta name="description" content="${e(description)}">
  <link rel="canonical" href="${url}">
  <meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(description)}">
  <meta property="og:type" content="website"><meta property="og:url" content="${url}"><meta property="og:locale" content="de_DE">
  ${p.image?`<meta property="og:image" content="${BASE}/${p.image}">`:''}
  <meta name="twitter:card" content="${p.image?'summary_large_image':'summary'}"><meta name="twitter:title" content="${e(title)}"><meta name="twitter:description" content="${e(description)}">
  <script type="application/ld+json">${json(schema)}</script>`;
  return shell.replace('{{HEAD}}',()=>head).replace('{{MAIN}}',()=>main)
    // Custom domain serves at /. Keep navigation/assets anchored there from nested pages.
    .replace(/\b(href|src)="([^"#/:][^":]*)"/g, (_,attr,value) => attr+'="/'+value+'"')
    .replace(/[ \t]+$/gm,'');
}
export function generateProducts(root=ROOT) {
  const all=catalog(root), shell=fs.readFileSync(path.join(root,'scripts/templates/product-page.tpl'),'utf8');
  const planned=new Map(all.map(p=>[filename(p),renderProduct(p,all,shell)]));
  const legacy=fs.readdirSync(root).filter(x=>/^shop-artikel-\d+\.html$/.test(x));
  if(legacy.length) throw new Error('Alte flache Artikel-URLs gefunden. Migration/Weiterleitungen bewusst planen: '+legacy.join(', '));
  const articleRoot=path.join(root,'artikel');
  const old=fs.existsSync(articleRoot)?fs.readdirSync(articleRoot).filter(x=>/\.html$/.test(x)).map(x=>'artikel/'+x):[];
  const obsolete=old.filter(x=>!planned.has(x));
  if(obsolete.length) throw new Error('Entfernte/geänderte Artikelnummern: '+obsolete.join(', ')+'. Alte URLs zuerst bewusst stilllegen/weiterleiten; kein automatisches Löschen.');
  let shop=fs.readFileSync(path.join(root,'shop.html'),'utf8');
  const grid=/(      <div class="product-grid" id="productGrid">\r?\n)[\s\S]*?(      <\/div>\r?\n      <p id="shopEmpty")/;
  if(!grid.test(shop)) throw new Error('Produktbereich in shop.html nicht gefunden. Abbruch statt unvollständigem Katalog.');
  const eol=shop.includes('\r\n')?'\r\n':'\n';
  const cards=all.map(renderProductCard).join('\n').replace(/\n/g,eol)
    // Preserve the established mixed line ending before generated detail links.
    .replace(/(<p class="product-desc">[^<]*<\/p>)\r\n/g,'$1\n');
  shop=shop.replace(grid,`$1${cards}${eol}$2`)
    .replace(/(<div class="shop-count" id="shopCount" role="status" aria-live="polite">)[^<]*(<\/div>)/,`$1${all.length} Artikel$2`);
  planned.set('shop.html',shop);
  for(const [key,[file,label]] of Object.entries(categories)) {
    const links=all.filter(p=>p.category===key).map(p=>`<li><a href="${filename(p)}">${escapeHTML(p.name)} — Art. ${p.sku}${p.desc?' · '+escapeHTML(p.desc):''}</a></li>`).join('\n');
    const block=`<!-- generated-product-links -->\n<section class="category-related" id="kategorie-artikel"><h2>Artikel: ${escapeHTML(label)}</h2><ul>${links}</ul></section>\n<!-- /generated-product-links -->`;
    let s=fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
    s=s.replace(/\s*<!-- generated-product-links -->[\s\S]*?<!-- \/generated-product-links -->/g,'');
    s=s.replace('</main>','\n'+block+'\n</main>');
    planned.set(file,s);
  }
  // Validate everything before changing any file. Only content changes are written.
  const changed=[];
  for(const [file,content] of planned) {
    const target=path.join(root,file);
    if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==content) { fs.mkdirSync(path.dirname(target),{recursive:true}); fs.writeFileSync(target,content); changed.push(file); }
  }
  return {products:all,changed};
}
