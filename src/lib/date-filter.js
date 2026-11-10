export function parseDate(value = '') {
  const text = value.trim();
  if (!text) return '';

  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!match) return null;

  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (!Number(year) || !Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10) === iso ? iso : null;
}

export function validateDateRange(fromText = '', toText = '') {
  const from = parseDate(fromText);
  const to = parseDate(toText);
  const errors = {
    from: from === null ? 'Enter a real date in DD/MM/YYYY format.' : '',
    to: to === null ? 'Enter a real date in DD/MM/YYYY format.' : ''
  };

  if (from && to && from > to) {
    errors.to = 'Date to must be on or after Date from.';
  }

  return { from, to, errors, valid: !errors.from && !errors.to };
}

export function matchesDateRange(releaseDate, { from, to }) {
  if (!from && !to) return true;
  if (typeof releaseDate !== 'string') return false;

  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(releaseDate);
  if (!match || !Number.isFinite(Date.parse(releaseDate))) return false;

  const [, year, month, day] = match;
  const date = parseDate(`${day}/${month}/${year}`);
  return Boolean(date && (!from || date >= from) && (!to || date <= to));
}