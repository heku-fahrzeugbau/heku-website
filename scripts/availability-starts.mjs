// Lieferbeginn der Anhänger im JSON-LD. HEKU nennt 2–3 Wochen; availabilityStarts
// steht auf dem Kalendertag heute (Europe/Berlin) plus 21 Tage, 00:00 Ortszeit.
// Der Wert in availability-starts.json ist die committete Quelle. Der Generator
// liest sie bei jedem Lauf neu. scripts/update-availability-starts.mjs schreibt
// sie montags neu, damit ein festes Datum nicht im Markup stehen bleibt.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const AVAILABILITY_STARTS_FILE = fileURLToPath(new URL('./availability-starts.json', import.meta.url));
export const TRAILER_LEAD_DAYS = 21;
export const TRAILER_TIME_ZONE = 'Europe/Berlin';
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;

function partsInTimeZone(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const out = {};
  for (const part of dtf.formatToParts(date)) out[part.type] = part.value;
  if (out.hour === '24') out.hour = '00';
  return out;
}

function offsetMinutes(date, timeZone) {
  const part = partsInTimeZone(date, timeZone);
  const asUTC = Date.UTC(+part.year, +part.month - 1, +part.day, +part.hour, +part.minute, +part.second);
  return Math.round((asUTC - date.getTime()) / 60000);
}

function formatOffset(minutes) {
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

// Kalendertag von `now` in Europe/Berlin, plus leadDays, als lokale Mitternacht mit Offset.
export function berlinAvailabilityStarts(now = new Date(), leadDays = TRAILER_LEAD_DAYS) {
  const today = partsInTimeZone(now, TRAILER_TIME_ZONE);
  const target = new Date(Date.UTC(+today.year, +today.month - 1, +today.day + leadDays));
  const year = target.getUTCFullYear();
  const month = target.getUTCMonth() + 1;
  const day = target.getUTCDate();
  let offset = offsetMinutes(new Date(Date.UTC(year, month - 1, day)), TRAILER_TIME_ZONE);
  let instant = new Date(Date.UTC(year, month - 1, day) - offset * 60000);
  offset = offsetMinutes(instant, TRAILER_TIME_ZONE);
  instant = new Date(Date.UTC(year, month - 1, day) - offset * 60000);
  offset = offsetMinutes(instant, TRAILER_TIME_ZONE);
  const pad = value => String(value).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}T00:00:00${formatOffset(offset)}`;
}

export function committedAvailabilityStarts() {
  let data;
  try { data = JSON.parse(fs.readFileSync(AVAILABILITY_STARTS_FILE, 'utf8')); }
  catch (error) { throw new Error(`Lieferbeginn konnte nicht gelesen werden (${AVAILABILITY_STARTS_FILE}): ${error.message}`); }
  if (!ISO_WITH_ZONE.test(data.availabilityStarts || '')) throw new Error('availability-starts.json: availabilityStarts muss ISO 8601 mit Zeitzone sein.');
  return data.availabilityStarts;
}

export function writeCommittedAvailabilityStarts(iso) {
  if (!ISO_WITH_ZONE.test(iso)) throw new Error(`Ungültiges availabilityStarts: ${iso}`);
  const next = `${JSON.stringify({ timeZone: TRAILER_TIME_ZONE, leadDays: TRAILER_LEAD_DAYS, availabilityStarts: iso }, null, 2)}\n`;
  const current = fs.existsSync(AVAILABILITY_STARTS_FILE) ? fs.readFileSync(AVAILABILITY_STARTS_FILE, 'utf8') : '';
  if (current === next) return false;
  fs.writeFileSync(AVAILABILITY_STARTS_FILE, next);
  return true;
}

// Setzt availabilityStarts nur an BackOrder-Angeboten. Preise und übriger Text bleiben stehen.
export function applyBackOrderStarts(html, iso) {
  if (!ISO_WITH_ZONE.test(iso)) throw new Error(`Ungültiges availabilityStarts: ${iso}`);
  if (!html.includes('https://schema.org/BackOrder')) return html;
  const stamp = `"availabilityStarts": "${iso}"`;
  if (html.includes('"availabilityStarts"')) return html.replace(/"availabilityStarts"\s*:\s*"[^"]*"/g, stamp);
  return html.replace(/"availability"\s*:\s*"https:\/\/schema\.org\/BackOrder"/g, match => `${match},\n    ${stamp}`);
}
