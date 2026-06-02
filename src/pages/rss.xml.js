import rss from '@astrojs/rss';
import { getSortedPosts } from '../utils/posts';

export async function GET(context) {
  const posts = await getSortedPosts();

  return rss({
    title: "marti's blog",
    description: 'Writing about life and my small opinions.',
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      link: `/blog/${post.id}/`,
    })),
  });
}
