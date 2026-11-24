import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatValue } from '../src/lib/valueFormatter.js';

describe('valueFormatter — numbers', () => {
  it('formats custom patterns with prefix, suffix, commas, and decimals', () => {
    assert.equal(formatValue('1234.5', '$ #,###.00'), '$ 1,234.50');
    assert.equal(formatValue(1234567.891, '£#,##0.00'), '£1,234,567.89');
    assert.equal(formatValue('348.126', '0.00 w'), '348.13 w');
    assert.equal(formatValue('21.5', '0.000'), '21.500');
    assert.equal(formatValue('10000', '#,##0'), '10,000');
    assert.equal(formatValue('0.5', '$ #,###.00'), '$ 0.50');
    assert.equal(formatValue('65.42', '0.0%'), '65.4%');
  });

  it('handles optional fractional digits (#) and rounding (half away from zero)', () => {
    assert.equal(formatValue('21.50', '0.##'), '21.5');
    assert.equal(formatValue('21.00', '0.##'), '21');
    assert.equal(formatValue('21.567', '0.##'), '21.57');
    assert.equal(formatValue('2', '0.0##'), '2.0');
    assert.equal(formatValue('1.25', '0.0'), '1.3');
    assert.equal(formatValue('-1.25', '0.0'), '-1.3');
    assert.equal(formatValue('-0.0001', '0.00'), '0.00');
  });

  it('supports standard .NET-style specifiers (N, F, P)', () => {
    assert.equal(formatValue('10000', 'N0'), '10,000');
    assert.equal(formatValue('1234.5', 'N3'), '1,234.500');
    assert.equal(formatValue('1234.5', 'F2'), '1234.50');
    assert.equal(formatValue('0.654', 'P1'), '65.4%');
  });

  it('handles negative numbers and leading zeros', () => {
    assert.equal(formatValue('-42.5', '$ #,##0.00'), '$ -42.50');
    assert.equal(formatValue('7', '000'), '007');
  });
});

describe('valueFormatter — dates, times, and DST/BST transitions', () => {
  it('formats Sun Next Rising ISO-8601 UTC timestamp in winter GMT (Europe/London)', () => {
    const raw = '2026-11-24T07:17:16+00:00';
    const opts = { timeZone: 'Europe/London', locale: 'en-GB' };

    assert.equal(formatValue(raw, 'HH:mm', opts), '07:17');
    assert.equal(formatValue(raw, 'HH:mm:ss', opts), '07:17:16');
    assert.equal(formatValue(raw, 'h:mm tt', opts), '7:17 AM');
    assert.equal(formatValue(raw, 'dd MMM HH:mm', opts), '24 Nov 07:17');
    assert.equal(formatValue(raw, 'ddd dd MMM yyyy', opts), 'Tue 24 Nov 2026');
    assert.equal(formatValue(raw, "'Rises at' HH:mm", opts), 'Rises at 07:17');
    assert.equal(formatValue(raw, 'HH:mm zzz', opts), '07:17 +00:00');
  });

  it('handles UK spring-forward GMT -> BST transition (2026-03-29 01:00 UTC)', () => {
    const opts = { timeZone: 'Europe/London', locale: 'en-GB' };

    // 1 minute before spring-forward: still GMT (+00:00)
    assert.equal(formatValue('2026-03-29T00:59:00+00:00', 'HH:mm zzz', opts), '00:59 +00:00');
    // At exact spring-forward instant: clocks jump to 02:00 BST (+01:00)
    assert.equal(formatValue('2026-03-29T01:00:00+00:00', 'HH:mm zzz', opts), '02:00 +01:00');
    // Summer solstice sunrise in UTC -> +1h in BST
    assert.equal(formatValue('2026-06-21T03:43:00+00:00', 'HH:mm zzz', opts), '04:43 +01:00');
  });

  it('handles UK fall-back BST -> GMT transition (2026-10-25 01:00 UTC)', () => {
    const opts = { timeZone: 'Europe/London', locale: 'en-GB' };

    // 30 minutes before fall-back: 01:30 BST (+01:00)
    assert.equal(formatValue('2026-10-25T00:30:00+00:00', 'HH:mm zzz', opts), '01:30 +01:00');
    // At exact fall-back instant: 01:00 GMT (+00:00)
    assert.equal(formatValue('2026-10-25T01:00:00+00:00', 'HH:mm zzz', opts), '01:00 +00:00');
    // 30 minutes after fall-back: 01:30 GMT (+00:00)
    assert.equal(formatValue('2026-10-25T01:30:00+00:00', 'HH:mm zzz', opts), '01:30 +00:00');
  });

  it('handles midnight (00:xx, never 24:xx) and day rollover across BST', () => {
    const opts = { timeZone: 'Europe/London', locale: 'en-GB' };

    // Winter midnight UTC -> 00:00 GMT
    assert.equal(formatValue('2026-11-24T00:00:00+00:00', 'HH:mm', opts), '00:00');
    assert.equal(formatValue('2026-11-24T00:05:00+00:00', 'h:mm tt', opts), '12:05 AM');
    // Summer 23:30 UTC -> rolls over to next calendar day 00:30 BST
    assert.equal(formatValue('2026-07-15T23:30:00+00:00', 'dd MMM HH:mm zzz', opts), '16 Jul 00:30 +01:00');
  });

  it('handles US DST transitions (America/New_York EDT/EST) and non-UTC input offsets', () => {
    const ny = { timeZone: 'America/New_York', locale: 'en-GB' };
    // Summer EDT (-04:00)
    assert.equal(formatValue('2026-07-15T14:00:00Z', 'HH:mm zzz', ny), '10:00 -04:00');
    // Winter EST (-05:00)
    assert.equal(formatValue('2026-11-24T14:00:00Z', 'HH:mm zzz', ny), '09:00 -05:00');
    // Non-UTC source offset converted to Europe/London during BST
    assert.equal(
      formatValue('2026-07-15T10:00:00-04:00', 'HH:mm zzz', { timeZone: 'Europe/London', locale: 'en-GB' }),
      '15:00 +01:00'
    );
  });

  it('formats relative time deterministically', () => {
    const now = new Date('2026-11-23T16:07:00Z');
    assert.equal(formatValue('2026-11-24T07:17:00+00:00', 'relative', { now }), 'in 15h 10m');
    assert.equal(formatValue('2026-11-23T16:52:00+00:00', 'relative', { now }), 'in 45m');
    assert.equal(formatValue('2026-11-23T14:02:00+00:00', 'relative', { now }), '2h 5m ago');
    assert.equal(formatValue('2026-11-23T16:07:20+00:00', 'relative', { now }), 'just now');
  });
});

describe('valueFormatter — passthrough & edge cases', () => {
  it('returns raw value when format is empty or value is non-numeric/non-date', () => {
    assert.equal(formatValue('2026-11-24T07:17:16+00:00', ''), '2026-11-24T07:17:16+00:00');
    assert.equal(formatValue('2026-11-24T07:17:16+00:00', null), '2026-11-24T07:17:16+00:00');
    assert.equal(formatValue('unavailable', 'HH:mm'), 'unavailable');
    assert.equal(formatValue('unknown', '$ #,###.00'), 'unknown');
    assert.equal(formatValue('home', '0.00 W'), 'home');
    assert.equal(formatValue(null, '0.00'), '');
  });
});
