import { html, raw } from '../lib/html.js';
import { Logo } from './Logo.js';
import { ThemeToggle } from './ThemeToggle.js';

export const Nav = () => html`
  <header class="site-header">
    <a class="brand" href="/">${raw(Logo({ size: 44 }))}<span>martilama</span></a>
    <nav>
      <a href="/blog">blog</a>
      <a href="/work">work</a>
      <a href="/about">about</a>
      <a href="https://github.com/SierraM-0" target="_blank" rel="noopener noreferrer">github</a>
      ${raw(ThemeToggle())}
    </nav>
  </header>`;
