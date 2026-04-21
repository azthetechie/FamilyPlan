// Utilities for recurring event expansion and reminders

export function dateKey(d) {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDate(str) {
  // str: YYYY-MM-DD
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Given the raw events list and a visible date range (start, end inclusive),
 * expand recurring events into occurrences within that range. Non-recurring
 * events are passed through unchanged (if in range). Respects event.exceptions.
 * Each occurrence carries a new `date` (ISO) but keeps its original `event_id`.
 * We add `occurrence_key` for React keys.
 */
export function expandEvents(events, rangeStart, rangeEnd) {
  const out = [];
  for (const e of events) {
    const base = parseDate(e.date);
    if (!base) continue;
    const exceptions = new Set(e.exceptions || []);
    const rec = e.recurring || 'none';
    if (rec === 'none') {
      if (base >= rangeStart && base <= rangeEnd && !exceptions.has(e.date)) {
        out.push({ ...e, occurrence_key: `${e.event_id}_${e.date}` });
      }
      continue;
    }
    const until = e.recur_until ? parseDate(e.recur_until) : null;
    const hardCap = until && until < rangeEnd ? until : rangeEnd;
    const cursor = new Date(base);
    while (cursor < rangeStart && cursor <= hardCap) {
      if (rec === 'daily') cursor.setDate(cursor.getDate() + 1);
      else if (rec === 'weekly') cursor.setDate(cursor.getDate() + 7);
      else if (rec === 'monthly') cursor.setMonth(cursor.getMonth() + 1);
      else break;
    }
    while (cursor <= hardCap) {
      const key = dateKey(cursor);
      if (!exceptions.has(key)) {
        out.push({
          ...e,
          date: key,
          occurrence_key: `${e.event_id}_${key}`,
          is_occurrence: key !== e.date,
        });
      }
      if (rec === 'daily') cursor.setDate(cursor.getDate() + 1);
      else if (rec === 'weekly') cursor.setDate(cursor.getDate() + 7);
      else if (rec === 'monthly') cursor.setMonth(cursor.getMonth() + 1);
      else break;
    }
  }
  return out;
}

/** Returns the next occurrence datetime for an event (with time), or null if none upcoming. */
export function nextOccurrenceDateTime(event, fromDate = new Date()) {
  if (!event.time) return null;
  const base = parseDate(event.date);
  if (!base) return null;
  const [hh, mm] = event.time.split(':').map(Number);
  const rec = event.recurring || 'none';
  const until = event.recur_until ? parseDate(event.recur_until) : null;

  const candidate = new Date(base);
  candidate.setHours(hh || 0, mm || 0, 0, 0);

  if (rec === 'none') {
    return candidate >= fromDate ? candidate : null;
  }
  // advance until >= fromDate
  while (candidate < fromDate) {
    if (rec === 'daily') candidate.setDate(candidate.getDate() + 1);
    else if (rec === 'weekly') candidate.setDate(candidate.getDate() + 7);
    else if (rec === 'monthly') candidate.setMonth(candidate.getMonth() + 1);
    else return null;
    if (until && candidate > until) return null;
  }
  return candidate;
}
