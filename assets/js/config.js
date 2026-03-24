/**
 * config.js — Site-wide configuration
 * Edit this file to update social links, site title, etc.
 * No HTML files need to be touched.
 */

window.VAGABOND_CONFIG = {
  title: 'The Vagabond',
  tagline: 'Every creation begins as an idea.\nBut ideas are everywhere —\n\nexpression is rare.',

  social: [
    { label: 'Instagram', url: 'https://instagram.com/' },
    { label: 'Twitter',   url: 'https://twitter.com/' },
  ],

  // Number of posts shown in "Latest" on homepage
  homepagePostCount: 8,

  // Content paths
  contentBase: '/content',
  categories: ['stories', 'poems', 'ideas'],

  // Category descriptions for category pages
  categoryMeta: {
    stories: {
      title: 'Stories',
      description: 'Narratives that linger, stitched with truth, memory, and quiet wonder.',
    },
    poems: {
      title: 'Poems',
      description: 'Words that breathe deeply, where silence speaks as loud as sound.',
    },
    ideas: {
      title: 'Ideas',
      description: 'Unusual sparks that bend convention and invite new ways of seeing.',
    },
  },
};
