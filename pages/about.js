import { html, raw } from '../lib/html.js';
import { BaseLayout } from '../layouts/BaseLayout.js';
import { Photo } from '../components/Photo.js';

export function about({ img, url }) {
  const body = html`
    <h1>About</h1>
    <p class="standfirst reveal reveal-2">
      The longer version of who's writing here.
    </p>
    <div class="prose reveal reveal-3">
      ${raw(Photo({ img: img['assets/about.png'], alt: "Marti standing in a life-size recreation of Van Gogh's bedroom in Arles", caption: "Inside Van Gogh's bedroom, more or less.", eager: true }))}
      <p>
        I'm Marti, from Albania, in Tallinn since 2019. I came on a scholarship to
        study engineering, but it was the Nordic culture that kept me here. My work at
        a fintech has drifted steadily upstream, into product — a kind of connective
        tissue between engineering and the people it's built for. I work in the space
        between teams, turning loose ends into decisions so everyone can keep moving.
      </p>
      <p>
        My tinkering is where that instinct started. I hand-tune my Linux desktop and
        poke at code until the web bends a little to what I want — notice the friction,
        change something, check whether it actually got better. Changing things fast is
        the closest thing I have to freedom.
      </p>
      <p>
        The fast part only works because the edges are rigid. I lift three times a
        week, eat one fixed meal of chicken and rice a day, and read on my Kindle every
        night. Anything worth building works that way: pin down what shouldn't move, and
        everything else can move quickly. Tend your own garden, and the butterflies
        arrive on their own.
      </p>
      <p class="about-coda">I'm still learning the rest.</p>
      <p>For what I focus on day to day, see <a href="/work">Work</a>.</p>

      <div class="section-head"><h2 class="section-kicker no-tick">How this site is built</h2></div>
      <p>
        A small static-site generator of my own, Claude Coded in Node in about a day.
      </p>
    </div>`;
  return BaseLayout({ title: 'About', description: 'A little about marti.', url, body });
}
