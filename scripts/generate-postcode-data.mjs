import fs from 'node:fs';
import path from 'node:path';

const source = process.argv[2];
if (!source || !fs.existsSync(source)) {
  console.error('Aufruf: node scripts/generate-postcode-data.mjs <Pfad zu GeoNames DE.txt>');
  process.exit(1);
}

const postcodeBuckets = new Map();
for (const line of fs.readFileSync(source, 'utf8').split(/\r?\n/)) {
  if (!line) continue;
  const fields = line.split('\t');
  const postcode = fields[1];
  const latitude = Number(fields[9]);
  const longitude = Number(fields[10]);
  if (!/^\d{5}$/.test(postcode) || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
  const bucket = postcodeBuckets.get(postcode) || { latitude: 0, longitude: 0, count: 0 };
  bucket.latitude += latitude;
  bucket.longitude += longitude;
  bucket.count += 1;
  postcodeBuckets.set(postcode, bucket);
}

const postcodes = {};
const prefixBuckets = new Map();
for (const [postcode, bucket] of [...postcodeBuckets].sort(([a], [b]) => a.localeCompare(b))) {
  const latitude = bucket.latitude / bucket.count;
  const longitude = bucket.longitude / bucket.count;
  postcodes[postcode] = [Number(latitude.toFixed(4)), Number(longitude.toFixed(4))];
  const prefix = postcode.slice(0, 2);
  const prefixBucket = prefixBuckets.get(prefix) || { latitude: 0, longitude: 0, count: 0 };
  prefixBucket.latitude += latitude;
  prefixBucket.longitude += longitude;
  prefixBucket.count += 1;
  prefixBuckets.set(prefix, prefixBucket);
}

const prefixes = {};
for (const [prefix, bucket] of [...prefixBuckets].sort(([a], [b]) => a.localeCompare(b))) {
  prefixes[prefix] = [
    Number((bucket.latitude / bucket.count).toFixed(4)),
    Number((bucket.longitude / bucket.count).toFixed(4)),
  ];
}

const output = {
  attribution: 'GeoNames postal code data, Creative Commons Attribution 4.0, https://www.geonames.org/',
  generated: new Date().toISOString().slice(0, 10),
  postcodes,
  prefixes,
};

const outputPath = path.resolve('assets/de-postcode-centroids.json');
fs.writeFileSync(outputPath, `${JSON.stringify(output)}\n`);
console.log(`${Object.keys(postcodes).length} deutsche Postleitzahlen nach ${outputPath} geschrieben.`);
