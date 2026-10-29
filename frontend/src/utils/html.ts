/**
 * Escapes text for safe interpolation into an HTML template string.
 *
 * Every view that builds markup with `innerHTML` must route untrusted values
 * (instance names, mod metadata, log lines, remote project titles) through this
 * helper so a stray `<script>`/`onerror=` can never become markup.
 */
export function escapeHtml(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
