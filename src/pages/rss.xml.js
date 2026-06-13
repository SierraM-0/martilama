import rss from '@astrojs/rss';
import { render } from 'astro:content';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import sanitizeHtml from 'sanitize-html';
import { getSortedPosts } from '../utils/posts';

export async function GET(context) {
  const container = await AstroContainer.create();
  const site = context.site.toString().replace(/\/$/, '');
  const posts = await getSortedPosts();

  const items = await Promise.all(
    posts.map(async (post) => {
      const { Content } = await render(post);
      // Render the post body to HTML, then make root-relative URLs absolute
      // so feed readers (Newsboat etc.) resolve links and images correctly.
      const html = (await container.renderToString(Content)).replace(
        /(href|src)="\//g,
        `$1="${site}/`,
      );

      return {
        title: post.data.title,
        description: post.data.description,
        pubDate: post.data.date,
        link: `/blog/${post.id}/`,
        content: sanitizeHtml(html, {
          allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
        }),
      };
    }),
  );

  return rss({
    title: "martilama",
    description: 'Writing about life and my small opinions.',
    site: context.site,
    items,
  });
}
