import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDate, validateDateRange, matchesDateRange } from '../src/lib/date-filter.js';

test('parses blank, padded and leap-year dates', () => {
  assert.equal(parseDate(), '');
  assert.equal(parseDate('  '), '');
  assert.equal(parseDate(' 29/02/2024 '), '2024-02-29');
  assert.equal(parseDate('01/01/2025'), '2025-01-01');
});

test('rejects malformed and impossible dates', () => {
  for (const value of ['1/1/2025', '2025-01-01', '29/02/2023', '31/04/2025', '00/12/2025', '01/13/2025', '01/01/0000']) {
    assert.equal(parseDate(value), null, value);
  }
});

test('validates optional bounds and reversed ranges', () => {
  for (const bounds of [['', ''], ['01/01/2025', ''], ['', '31/01/2025'], ['01/01/2025', '01/01/2025']]) {
    assert.equal(validateDateRange(...bounds).valid, true);
  }
  assert.equal(validateDateRange('02/01/2025', '01/01/2025').valid, false);
  assert.ok(validateDateRange('02/01/2025', '01/01/2025').errors.to);
  assert.ok(validateDateRange('invalid', '').errors.from);
  assert.ok(validateDateRange('', '31/02/2025').errors.to);
});

test('matches inclusive calendar dates, independently of time or timezone', () => {
  const range = validateDateRange('01/01/2025', '31/01/2025');
  for (const value of ['2025-01-01', '2025-01-01T00:00:00+14:00', '2025-01-31T23:59:59Z', '2025-01-31T23:59:59-05:00']) {
    assert.equal(matchesDateRange(value, range), true, value);
  }
  for (const value of ['2024-12-31', '2025-02-01', '2025-02-30', 'not a date', null, undefined]) {
    assert.equal(matchesDateRange(value, range), false, String(value));
  }
});

test('supports one-sided and same-day ranges', () => {
  assert.equal(matchesDateRange('2026-01-01', validateDateRange('01/01/2025', '')), true);
  assert.equal(matchesDateRange('2024-01-01', validateDateRange('01/01/2025', '')), false);
  assert.equal(matchesDateRange('2024-01-01', validateDateRange('', '01/01/2025')), true);
  assert.equal(matchesDateRange('2026-01-01', validateDateRange('', '01/01/2025')), false);
  assert.equal(matchesDateRange('2025-01-01T23:59:59Z', validateDateRange('01/01/2025', '01/01/2025')), true);
  assert.equal(matchesDateRange('2025-01-02', validateDateRange('01/01/2025', '01/01/2025')), false);
});

test('does not exclude missing or invalid dates when no date filter is active', () => {
  for (const value of [null, undefined, 'invalid', '2025-01-01']) {
    assert.equal(matchesDateRange(value, validateDateRange()), true);
  }
});