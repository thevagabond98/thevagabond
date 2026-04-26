/**
 * config.js — Site-wide configuration
 * Edit this file to update social links, site title, etc.
 */

window.VAGABOND_CONFIG = {
  title: 'The Vagabond',
  tagline: 'Navigating the noise — politics, stories, poetry & ideas for people who still believe words matter.',

  social: [
    { label: 'Twitter',   url: 'https://x.com/The_Vagabond98' },
    { label: 'Instagram', url: 'https://www.instagram.com/the_vagabond_98/' },
  ],

  homepagePostCount: 8,
  contentBase: '/content',
  categories: ['stories', 'poems', 'ideas'],

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
