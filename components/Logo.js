import { html } from '../lib/html.js';

export const Logo = ({ size = 30 } = {}) => html`
  <svg width="${size}" height="${size}" viewBox="0 0 64 64" class="logo-mark" aria-hidden="true" focusable="false">
    <rect x="3" y="3" width="58" height="58" rx="18" fill="var(--accent)" />
    <g fill="none" stroke="var(--bg)" stroke-width="5" stroke-linecap="round">
      <path d="M21 19 V45" /><path d="M43 19 V45" />
      <path d="M21 22 L43 34" /><path d="M43 22 L21 34" />
    </g>
  </svg>`;
