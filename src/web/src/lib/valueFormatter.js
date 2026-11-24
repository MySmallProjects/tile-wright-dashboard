/**
 * Shared value formatter for Tilewright tiles and addons.
 *
 * Supports:
 * - Numbers: custom patterns ("$ #,###.00", "0.00 W", "0.000", "0.##", "#,##0")
 *   and standard .NET-style specifiers ("N0", "N2", "F3", "P1").
 * - ISO-8601 dates/timestamps: token patterns ("HH:mm", "h:mm tt", "dd MMM HH:mm",
 *   "'Rises at' HH:mm", "yyyy-MM-dd HH:mm:ss zzz") and "relative".
 *   Converted to the browser's local timezone (or explicit options.timeZone)
 *   with full DST/BST awareness.
 * - Passthrough for non-numeric, non-date values ("unavailable", "home", etc.).
 */

const STRICT_NUMBER_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const ISO_DATE_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const STANDARD_NUM_RE = /^([NFP])(\d*)$/i;
const DATE_TOKEN_RE =
  /'([^']*)'|yyyy|yy|MMMM|MMM|MM|M|dddd|ddd|dd|d|HH|H|hh|h|mm|m|ss|s|tt|t|zzz|zz/g;

/**
 * Format a raw value (number, numeric string, ISO-8601 timestamp, or Date)
 * using a power-user format string.
 *
 * @param {unknown} rawValue
 * @param {string | null | undefined} formatString
 * @param {{ timeZone?: string, locale?: string, now?: Date | number }} [options]
 * @returns {string}
 */
export function formatValue(rawValue, formatString, options = {}) {
  if (rawValue === null || rawValue === undefined) return '';
  const rawStr = rawValue instanceof Date ? rawValue.toISOString() : String(rawValue);
  if (!formatString || typeof formatString !== 'string' || !formatString.trim()) {
    return rawStr;
  }

  const fmt = formatString;

  // 1. Date object or ISO-8601 date/timestamp
  if (rawValue instanceof Date) {
    if (Number.isNaN(rawValue.getTime())) return rawStr;
    return formatDate(rawValue, fmt, options);
  }

  // 2. Numeric value (check before date so pure numbers aren't misread)
  const num = tryParseNumber(rawValue);
  if (num !== null) {
    return formatNumber(num, fmt);
  }

  // 3. ISO-8601 date string
  const parsed = tryParseIsoDate(rawStr);
  if (parsed !== null) {
    return formatDate(parsed.date, fmt, parsed.dateOnly ? { ...options, timeZone: undefined } : options);
  }

  // 4. Passthrough for non-numeric, non-date states (e.g. "unavailable", "home")
  return rawStr;
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function tryParseNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || !STRICT_NUMBER_RE.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {string} rawStr
 * @returns {{ date: Date, dateOnly: boolean } | null}
 */
function tryParseIsoDate(rawStr) {
  const trimmed = rawStr.trim();
  const m = ISO_DATE_RE.exec(trimmed);
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // Date-only string (YYYY-MM-DD): interpret as local calendar date (00:00:00)
  if (m[4] === undefined) {
    const d = new Date(year, month - 1, day, 0, 0, 0, 0);
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
      return null;
    }
    return { date: d, dateOnly: true };
  }

  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = m[6] !== undefined ? Number(m[6]) : 0;
  if (hour > 23 || minute > 59 || second > 59) return null;

  // Normalize space separator to 'T' and "+0100" to "+01:00"
  let normalized = trimmed.replace(' ', 'T');
  if (m[8] && /^[+-]\d{4}$/.test(m[8])) {
    normalized = normalized.slice(0, -2) + ':' + normalized.slice(-2);
  }

  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;
  return { date: d, dateOnly: false };
}

/**
 * Round a non-negative number to `decimals` decimal places using half-away-from-zero
 * to match .NET MidpointRounding.AwayFromZero.
 *
 * @param {number} absVal
 * @param {number} decimals
 * @returns {string}
 */
function roundHalfAwayFromZero(absVal, decimals) {
  const d = Math.max(0, Math.min(20, decimals));
  if (absVal === 0) {
    return d > 0 ? '0.' + '0'.repeat(d) : '0';
  }
  const factor = Math.pow(10, d);
  // Add tiny epsilon to avoid binary float issues like 1.005 * 100 = 100.49999999999999
  const scaled = Math.floor(absVal * factor + 0.5 + 1e-12);
  const str = String(scaled);
  if (d === 0) return str;
  if (str.length <= d) {
    return '0.' + '0'.repeat(d - str.length) + str;
  }
  return str.slice(0, str.length - d) + '.' + str.slice(str.length - d);
}

/**
 * Add thousands commas to an integer digit string.
 * @param {string} intStr
 * @returns {string}
 */
function addGrouping(intStr) {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format a numeric value using either standard specifiers (N2, F3, P1)
 * or a custom pattern with optional prefix/suffix ("$ #,###.00", "0.00 W").
 *
 * @param {number} num
 * @param {string} format
 * @returns {string}
 */
function formatNumber(num, format) {
  const trimmed = format.trim();

  // 1. Standard .NET-style specifiers: N[d], F[d], P[d]
  const std = STANDARD_NUM_RE.exec(trimmed);
  if (std) {
    const code = std[1].toUpperCase();
    const decimals = std[2] === '' ? 2 : Math.min(20, Number(std[2]));
    const effective = code === 'P' ? num * 100 : num;
    const isNeg = effective < 0;
    const rounded = roundHalfAwayFromZero(Math.abs(effective), decimals);
    const [rawInt, rawFrac = ''] = rounded.split('.');
    const intPart = code === 'N' || code === 'P' ? addGrouping(rawInt) : rawInt;
    const zeroCheck = Number(rounded) === 0;
    const sign = isNeg && !zeroCheck ? '-' : '';
    const body = rawFrac ? `${intPart}.${rawFrac}` : intPart;
    return code === 'P' ? `${sign}${body}%` : `${sign}${body}`;
  }

  // 2. Custom numeric pattern: extract prefix, core (#, 0, ',', '.'), and suffix
  const parsed = extractNumericPattern(format);
  if (!parsed) {
    return String(num);
  }

  const { prefix, intPattern, fracPattern, suffix } = parsed;
  const useGrouping = intPattern.includes(',');
  const cleanIntPat = intPattern.replace(/,/g, '');
  const minIntDigits = Math.max(1, (cleanIntPat.match(/0/g) || []).length);

  const maxFracDigits = fracPattern.length;
  let minFracDigits = 0;
  for (let i = 0; i < fracPattern.length; i++) {
    if (fracPattern[i] === '0') {
      minFracDigits = i + 1;
    }
  }

  const isNeg = num < 0;
  const rounded = roundHalfAwayFromZero(Math.abs(num), maxFracDigits);
  let [intStr, fracStr = ''] = rounded.split('.');

  // Trim optional trailing zeros down to minFracDigits
  if (fracStr.length > minFracDigits) {
    let end = fracStr.length;
    while (end > minFracDigits && fracStr[end - 1] === '0') {
      end--;
    }
    fracStr = fracStr.slice(0, end);
  }

  if (intStr.length < minIntDigits) {
    intStr = '0'.repeat(minIntDigits - intStr.length) + intStr;
  }

  if (useGrouping) {
    intStr = addGrouping(intStr);
  }

  const isEffectiveZero = Number(rounded) === 0;
  const sign = isNeg && !isEffectiveZero ? '-' : '';
  const body = fracStr.length > 0 ? `${intStr}.${fracStr}` : intStr;
  return `${prefix}${sign}${body}${suffix}`;
}

/**
 * Parse a custom numeric format string into { prefix, intPattern, fracPattern, suffix }.
 * Supports single-quoted literals ('...').
 *
 * @param {string} fmt
 * @returns {{ prefix: string, intPattern: string, fracPattern: string, suffix: string } | null}
 */
function extractNumericPattern(fmt) {
  let prefix = '';
  let core = '';
  let suffix = '';
  let state = 'prefix'; // 'prefix' | 'core' | 'suffix'
  let inQuote = false;

  for (let i = 0; i < fmt.length; i++) {
    const ch = fmt[i];
    if (ch === "'") {
      inQuote = !inQuote;
      continue;
    }

    if (inQuote) {
      if (state === 'prefix') prefix += ch;
      else {
        state = 'suffix';
        suffix += ch;
      }
      continue;
    }

    const isDigitPlaceholder = ch === '#' || ch === '0';
    const isSeparator = ch === ',' || ch === '.';

    if (state === 'prefix') {
      if (isDigitPlaceholder) {
        state = 'core';
        core += ch;
      } else if (ch === '.' && i + 1 < fmt.length && (fmt[i + 1] === '#' || fmt[i + 1] === '0')) {
        state = 'core';
        core += ch;
      } else {
        prefix += ch;
      }
    } else if (state === 'core') {
      if (isDigitPlaceholder || isSeparator) {
        core += ch;
      } else {
        state = 'suffix';
        suffix += ch;
      }
    } else {
      suffix += ch;
    }
  }

  // Must contain at least one '#' or '0' to be a numeric pattern
  if (!/[#0]/.test(core)) return null;

  // Move any trailing ',' or '.' that aren't part of the pattern into suffix
  while (core.endsWith('.') || core.endsWith(',')) {
    suffix = core[core.length - 1] + suffix;
    core = core.slice(0, -1);
  }

  const dotIdx = core.indexOf('.');
  const intPattern = dotIdx >= 0 ? core.slice(0, dotIdx) : core;
  const fracPattern = dotIdx >= 0 ? core.slice(dotIdx + 1).replace(/[^#0]/g, '') : '';

  return { prefix, intPattern, fracPattern, suffix };
}

/**
 * Format a Date in the target timezone (browser local by default) with DST/BST awareness.
 *
 * @param {Date} date
 * @param {string} format
 * @param {{ timeZone?: string, locale?: string, now?: Date | number }} options
 * @returns {string}
 */
function formatDate(date, format, options = {}) {
  const trimmed = format.trim();
  if (trimmed.toLowerCase() === 'relative') {
    const nowMs =
      options.now instanceof Date
        ? options.now.getTime()
        : typeof options.now === 'number'
          ? options.now
          : Date.now();
    return formatRelative(date.getTime() - nowMs);
  }

  const locale = options.locale || 'en-GB';
  const tz = options.timeZone;

  const parts = getZonedParts(date, tz, locale);
  const hour24 = parts.hour24;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const ampm = hour24 < 12 ? 'AM' : 'PM';
  const offsetMin = getTimezoneOffsetMinutes(date, parts);
  const offsetSign = offsetMin >= 0 ? '+' : '-';
  const absOff = Math.abs(offsetMin);
  const offH = pad2(Math.floor(absOff / 60));
  const offM = pad2(absOff % 60);

  return format.replace(DATE_TOKEN_RE, (match, quoted) => {
    if (quoted !== undefined) return quoted;
    switch (match) {
      case 'yyyy': return String(parts.year).padStart(4, '0');
      case 'yy': return String(parts.year % 100).padStart(2, '0');
      case 'MMMM': return parts.monthLong;
      case 'MMM': return parts.monthShort;
      case 'MM': return pad2(parts.month);
      case 'M': return String(parts.month);
      case 'dddd': return parts.weekdayLong;
      case 'ddd': return parts.weekdayShort;
      case 'dd': return pad2(parts.day);
      case 'd': return String(parts.day);
      case 'HH': return pad2(hour24);
      case 'H': return String(hour24);
      case 'hh': return pad2(hour12);
      case 'h': return String(hour12);
      case 'mm': return pad2(parts.minute);
      case 'm': return String(parts.minute);
      case 'ss': return pad2(parts.second);
      case 's': return String(parts.second);
      case 'tt': return ampm;
      case 't': return ampm[0];
      case 'zzz': return `${offsetSign}${offH}:${offM}`;
      case 'zz': return `${offsetSign}${offH}`;
      default: return match;
    }
  });
}

/**
 * Extract calendar & clock parts for a Date in a given IANA timezone (or local timezone).
 * Uses `hourCycle: 'h23'` so midnight is always 00 (never 24).
 *
 * @param {Date} date
 * @param {string | undefined} timeZone
 * @param {string} locale
 */
function getZonedParts(date, timeZone, locale) {
  /** @type {Intl.DateTimeFormatOptions} */
  const numericOpts = {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23'
  };
  if (timeZone) numericOpts.timeZone = timeZone;

  const numParts = new Intl.DateTimeFormat('en-US', numericOpts).formatToParts(date);
  /** @type {Record<string, string>} */
  const map = {};
  for (const p of numParts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }

  /** @type {Intl.DateTimeFormatOptions} */
  const longOpts = { month: 'long', weekday: 'long' };
  /** @type {Intl.DateTimeFormatOptions} */
  const shortOpts = { month: 'short', weekday: 'short' };
  if (timeZone) {
    longOpts.timeZone = timeZone;
    shortOpts.timeZone = timeZone;
  }

  let monthLong = '';
  let weekdayLong = '';
  for (const p of new Intl.DateTimeFormat(locale, longOpts).formatToParts(date)) {
    if (p.type === 'month') monthLong = p.value;
    if (p.type === 'weekday') weekdayLong = p.value;
  }

  let monthShort = '';
  let weekdayShort = '';
  for (const p of new Intl.DateTimeFormat(locale, shortOpts).formatToParts(date)) {
    if (p.type === 'month') monthShort = p.value;
    if (p.type === 'weekday') weekdayShort = p.value;
  }

  const rawHour = Number(map.hour);
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour24: rawHour === 24 ? 0 : rawHour,
    minute: Number(map.minute),
    second: Number(map.second),
    monthLong,
    monthShort,
    weekdayLong,
    weekdayShort
  };
}

/**
 * Compute the exact UTC offset in minutes for the zoned parts of `date`.
 * Positive for east of UTC (e.g. +60 for BST), negative for west (e.g. -240 for EDT).
 */
function getTimezoneOffsetMinutes(date, parts) {
  const asUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour24,
    parts.minute,
    parts.second
  );
  const actualSecMs = Math.floor(date.getTime() / 1000) * 1000;
  return Math.round((asUtcMs - actualSecMs) / 60000);
}

/**
 * Format a millisecond delta into a compact human-readable relative string.
 * @param {number} diffMs positive = future, negative = past
 * @returns {string}
 */
function formatRelative(diffMs) {
  const absSec = Math.round(Math.abs(diffMs) / 1000);
  if (absSec < 45) return 'just now';

  const future = diffMs > 0;
  const totalMin = Math.round(absSec / 60);
  let text;
  if (totalMin < 60) {
    text = `${totalMin}m`;
  } else {
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    if (hours < 24) {
      text = mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    } else {
      const days = Math.floor(hours / 24);
      const remHours = hours % 24;
      text = remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
    }
  }
  return future ? `in ${text}` : `${text} ago`;
}

/**
 * @param {number} n
 * @returns {string}
 */
function pad2(n) {
  return String(n).padStart(2, '0');
}
