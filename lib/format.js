export function formatDate(date) {
  return date.toLocaleDateString('en-GB', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}
export function formatDateLong(date) {
  return date.toLocaleDateString('en-GB', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}
