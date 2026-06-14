import { html, raw } from '../lib/html.js';

export const Photo = ({ img, alt, caption, wide = false, eager = false }) => html`
  <figure class="photo${wide ? ' photo--wide' : ''}">
    <img src="${img.src}" srcset="${img.srcset}" width="${img.width}" height="${img.height}"
         alt="${alt}" loading="${eager ? 'eager' : 'lazy'}" decoding="async" />
    ${caption ? raw(html`<figcaption>${caption}</figcaption>`) : ''}
  </figure>`;
