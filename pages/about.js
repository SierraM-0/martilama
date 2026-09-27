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
      ${raw(Photo({ img: img['assets/about.png'], alt: "Marti standing in a life-size recreation of Van Gogh's bedroom in Arles", caption: "Inside Van Gogh's bedroom, more or less.", eager: true }))}
      <p>
        I'm Marti, from Albania, in Tallinn since 2019. I came on a scholarship to
        study engineering, but it was the Nordic culture that kept me here. My work at a fintech has drifted steadily upstream, into a kind of
        connective tissue between engineering and product — I take on whatever they
        need so they can stay focused on their own work.
      </p>
      <p>
        What pulls me is the tinkering — changing things fast is the closest thing I
        have to freedom. I hand-tune my Linux desktop and poke at code until the web
        bends a little to what I want. The fast part only works because the edges are
        rigid — lifting three times a week, one fixed meal of chicken and rice a day, a
        Kindle every night. Tend your own garden, and the butterflies arrive on their own.
      </p>
      <p class="about-coda">I'm still learning the rest.</p>

      <div class="section-head"><h2 class="section-kicker no-tick">How this site is built</h2></div>
      <p>
        Claude Coded in Node in about a day — a small static-site generator, no
        framework, no trackers, no cookies. Set in <em>Fraunces</em> and <em>Newsreader</em>.
      </p>
    </div>`;
  return BaseLayout({ title: 'About', description: 'A little about marti.', url, body });
}
