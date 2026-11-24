export interface FormatValueOptions {
  /** Optional IANA timezone (e.g. "Europe/London"). Defaults to the browser's local timezone. */
  timeZone?: string;
  /** Optional BCP-47 locale for month/weekday names (default: "en-GB"). */
  locale?: string;
  /** Optional reference time for "relative" formatting (default: Date.now()). */
  now?: Date | number;
}

/**
 * Format a raw sensor/API value (number, numeric string, ISO-8601 date/timestamp, or Date)
 * using a power-user format string (e.g. "$ #,###.00", "0.00 W", "HH:mm", "relative").
 */
export function formatValue(
  rawValue: unknown,
  formatString: string | null | undefined,
  options?: FormatValueOptions
): string;
