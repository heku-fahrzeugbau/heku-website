// Setzt availabilityStarts der Anhänger-Angebote auf heute (Europe/Berlin) plus 21 Tage.
// Modellseiten kommen aus dem Generator, der die committete Konstante liest.
// ruderbootanhaenger.html ist keine generierte Modellseite und wird direkt gepatcht.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './generate-sitemap.mjs';
import { generateModels } from './generate-model-pages.mjs';
import { applyBackOrderStarts, berlinAvailabilityStarts, writeCommittedAvailabilityStarts } from './availability-starts.mjs';

const ruderFile = 'ruderbootanhaenger.html';

export function updateAvailabilityStarts(root = ROOT, now = new Date()) {
  const iso = berlinAvailabilityStarts(now);
  const changed = [];
  if (writeCommittedAvailabilityStarts(iso)) changed.push('scripts/availability-starts.json');
  for (const file of generateModels(root).changed) changed.push(file);
  const ruderPath = path.join(root, ruderFile);
  const before = fs.readFileSync(ruderPath, 'utf8');
  const after = applyBackOrderStarts(before, iso);
  if (after !== before) {
    fs.writeFileSync(ruderPath, after);
    changed.push(ruderFile);
  }
  return { iso, changed };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = updateAvailabilityStarts();
  console.log(`availabilityStarts ${result.iso}; ${result.changed.length ? result.changed.join(', ') : 'keine Änderung'}`);
}
