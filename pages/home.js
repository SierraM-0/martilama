import { html, raw } from '../lib/html.js';
import { BaseLayout } from '../layouts/BaseLayout.js';
import { PostCard } from '../components/PostCard.js';

export function home({ posts, img, url }) {
  const recent = posts.slice(0, 5);
  const p = img['assets/portrait.png'];
  const body = html`
    <section class="intro reveal">
      <img class="portrait" src="${p.src}" srcset="${p.srcset}" width="120" height="120"
           alt="A photo of marti" loading="eager" fetchpriority="high" decoding="async" />
      <div>
        <h1>Hello 👋🏻</h1>
        <p>I'm Marti — a product specialist based in Tallinn. This is where I write
           about life in general and whatever small opinions I happen to be holding.</p>
      </div>
    </section>
    <p class="hero-meta reveal reveal-2">Tallinn, Estonia · <time id="localtime">—</time> local</p>

    <section class="credo reveal reveal-3">
      <hr class="credo-rule" />
      <p class="credo-lead">A good tool does more by asking less.</p>
      <p class="credo-follow">That ease can be crafted — the effort just lives
        upstream, in the making.</p>
    </section>

    <div class="section-head reveal reveal-3">
      <h2 class="section-kicker">Currently</h2>
    </div>
    <dl class="now-list reveal reveal-3">
      <div class="now-row">
        <dt class="now-label">Reading</dt>
        <dd class="now-val"><em>The Soul of a New Machine</em> <span class="by">— Tracy Kidder</span></dd>
      </div>
      <div class="now-row">
        <dt class="now-label">Playing</dt>
        <dd class="now-val"><em>Factorio</em></dd>
      </div>
    </dl>

    <div class="section-head reveal reveal-4">
      <h2 class="section-kicker">Recent posts</h2>
      <a class="section-more" href="/blog">all posts →</a>
    </div>
    ${recent.map((post) => raw(PostCard({ post })))}`;
  return BaseLayout({ url, body });
}
