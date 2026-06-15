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
        I'm Marti, from Albania, in Tallinn since 2019. I came on a scholarship to
        study engineering, drawn by how far ahead the tech market here already was,
        and I stayed once the degree was done. The work since has been a steady drift
        upstream — Customer Support at a fintech while I studied, then minding
        internal-tooling bug reports, then Product Specialist, and now a kind of
        gap-filler. I take on whatever the product needs — regulatory requirements for
        different countries, banking-partner needs, product fixes — gatekeep what
        ships, change config or write code, so engineering and product can stay focused.
      </p>
      <p>
        What pulls me is the tinkering itself: changing things, and changing them
        fast, is the closest thing I have to freedom. So I hand-tune my Linux desktop,
        wire small scripts together until it runs itself, and poke at code until the
        web bends a little to what I want. The fast part only works because the edges
        are rigid — lifting three times a week, two on the weekend; one fixed meal of
        chicken and rice every day; a Kindle every night before sleep. Tend your own
        garden, and in time the butterflies arrive on their own. I'm still learning the rest.
      </p>

      <div class="section-head"><h2 class="section-kicker no-tick">How this site is built</h2></div>
      <p>
        Claude Coded in Node in about a day — a small static-site generator, no
        framework, no trackers, no cookies. Set in <em>Fraunces</em> and <em>Newsreader</em>.
      </p>
    </div>`;
  return BaseLayout({ title: 'About', description: 'A little about marti.', url, body });
}
