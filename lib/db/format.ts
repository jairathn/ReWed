/** Convert a pg DATE value (JS Date or string) to YYYY-MM-DD */
export function toDateString(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value);
}
