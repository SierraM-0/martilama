import { getCollection, type CollectionEntry } from 'astro:content';

/** All blog posts, sorted newest-first by date. */
export async function getSortedPosts(): Promise<CollectionEntry<'blog'>[]> {
  const posts = await getCollection('blog');
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}
