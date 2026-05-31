/** Turn datetime-local / ISO strings into "M/D/YYYY · h:mm AM/PM" */
function formatPickupDateTime(value) {
  if (value == null || value === '') return 'TBD';
  const raw = String(value).trim();
  if (raw.toUpperCase() === 'TBD') return 'TBD';

  const local = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (local) {
    const [, y, mo, d, h, mi] = local;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
    if (!Number.isNaN(dt.getTime())) {
      const datePart = `${Number(mo)}/${Number(d)}/${y}`;
      const timePart = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      return `${datePart} · ${timePart}`;
    }
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime()) && /[-T:]/.test(raw)) {
    const datePart = `${parsed.getMonth() + 1}/${parsed.getDate()}/${parsed.getFullYear()}`;
    const timePart = parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${datePart} · ${timePart}`;
  }

  return raw;
}

module.exports = { formatPickupDateTime };
