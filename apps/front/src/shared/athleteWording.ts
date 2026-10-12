/** Adapts coach-configured Persian copy when it is displayed to an athlete. */
export function athleteFacingText(value: string): string {
  return value.replaceAll("شاگرد", "ورزشکار");
}
