const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ENTITIES[c]);

const RAW = Symbol('raw');
export const raw = (value) => ({ [RAW]: true, value: String(value) });

function render(value) {
  if (value == null || value === false || value === true) return '';
  if (Array.isArray(value)) return value.map(render).join('');
  if (typeof value === 'object' && value[RAW]) return value.value;
  if (typeof value === 'object') {
    throw new TypeError('html: cannot render a plain object — wrap it with raw() or convert to a string first.');
  }
  return escape(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return out;
}
