/** تنسيق الأرقام بالفواصل الإنجليزية: 5,000 و 1,000,000 */
export function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

/** تنسيق مبلغ بإشارة: +5,000 / -500 */
export function fmtSigned(n: number): string {
  return n > 0 ? `+${fmt(n)}` : fmt(n);
}
