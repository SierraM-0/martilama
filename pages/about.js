import { html, raw } from '../lib/html.js';
import { BaseLayout } from '../layouts/BaseLayout.js';
import { Photo } from '../components/Photo.js';

export function about({ img, url }) {
  const body = html`
    <h1>About</h1>
    <p class="standfirst reveal reveal-2">
      A product specialist in Tallinn — and the longer version of who's writing here.
    </p>
    <div class="prose reveal reveal-3">
      ${raw(Photo({ img: img['assets/portrait.png'], alt: 'A photo of marti', caption: 'Somewhere in Tallinn.', eager: true }))}
      <p>
        I'm Marti, a product specialist living in Tallinn, Estonia. I spend my days
        thinking about how products actually serve the people using them — and my
        evenings tinkering with a hand-tuned Linux desktop, reading whatever's
        half-finished on the bedside table, and playing slow, atmospheric games.
      </p>
      <p>
        This site is where I keep my writing and a little about the work I do. No
        fixed theme — just life and the small opinions I pick up along the way.
      </p>

      <div class="section-head"><h2 class="section-kicker no-tick">How this site is built</h2></div>
      <p>
        Built in about a day with Claude Code — a small static-site generator in
        plain Node.js, no framework. Set in <em>Fraunces</em> and <em>Newsreader</em>.
      </p>
    </div>`;
  return BaseLayout({ title: 'About', description: 'A little about marti.', url, body });
}
