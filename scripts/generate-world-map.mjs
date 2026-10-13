import fs from 'node:fs';

const [sourcePath, outputPath] = process.argv.slice(2);
if (!sourcePath || !outputPath) {
  throw new Error('Usage: node scripts/generate-world-map.mjs <countries.geojson> <output.svg>');
}

const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const width = 1200;
const height = 600;
// Preserve enough coastline and border detail for a country-level zoom.
// 0.025 degrees corresponds to roughly 2–3 km in central Europe while
// keeping the complete map light enough for a public webpage.
const tolerance = 0.025;

function project([longitude, latitude]) {
  return [
    ((longitude + 180) / 360) * width,
    ((90 - latitude) / 180) * height,
  ];
}

function perpendicularDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (dx === 0 && dy === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy));
}

function simplify(points, epsilon) {
  if (points.length <= 4) return points;
  let farthestIndex = 0;
  let farthestDistance = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = perpendicularDistance(points[index], points[0], points.at(-1));
    if (distance > farthestDistance) {
      farthestDistance = distance;
      farthestIndex = index;
    }
  }
  if (farthestDistance <= epsilon) return [points[0], points.at(-1)];
  return [
    ...simplify(points.slice(0, farthestIndex + 1), epsilon).slice(0, -1),
    ...simplify(points.slice(farthestIndex), epsilon),
  ];
}

function ringToPath(ring) {
  const points = simplify(ring, tolerance).map(project);
  if (points.length < 3) return '';
  return `M${points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}Z`;
}

function geometryToPath(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.map((polygon) => polygon.map(ringToPath).join('')).join('');
}

const countries = source.features
  .filter((feature) => feature.geometry && ['Polygon', 'MultiPolygon'].includes(feature.geometry.type))
  .map((feature) => {
    const name = feature.properties?.ADMIN || feature.properties?.name || 'Land';
    return `<path vector-effect="non-scaling-stroke" d="${geometryToPath(feature.geometry)}"><title>${String(name).replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</title></path>`;
  })
  .join('\n');

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Country geometry: Natural Earth public-domain data via datasets/geo-countries. -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
  <title id="title">Weltkarte mit Ländergrenzen</title>
  <desc id="description">Politische Weltkarte mit Küstenlinien und Staatsgrenzen.</desc>
  <g id="countries" fill="#cbd7df" stroke="#ffffff" stroke-width="0.85" stroke-linejoin="round">
${countries}
  </g>
</svg>
`;

fs.writeFileSync(outputPath, svg, 'utf8');
