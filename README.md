# The Vagabond — Setup Guide

A minimal CMS-powered writing platform. Static HTML/CSS/JS frontend,
Netlify CMS backend, Git-based content storage.

---

## Folder Structure

```
/
├── index.html                  ← Homepage
├── about.html                  ← About page
├── post.html                   ← Dynamic post page (?category=&slug=)
├── netlify.toml                ← Netlify config + build command
├── generate-index.js           ← Rebuilds content/*/index.json
│
├── stories/index.html          ← Stories category page
├── poems/index.html            ← Poems category page
├── ideas/index.html            ← Ideas category page
│
├── content/
│   ├── stories/
│   │   ├── index.json          ← Auto-generated slug list
│   │   └── *.md                ← Story posts
│   ├── poems/
│   │   ├── index.json
│   │   └── *.md
│   └── ideas/
│       ├── index.json
│       └── *.md
│
├── admin/
│   ├── index.html              ← Netlify CMS loader
│   └── config.yml              ← CMS collections config
│
└── assets/
    ├── css/style.css           ← All styles (dark + light mode)
    └── js/
        ├── config.js           ← Social links, site settings
        ├── theme.js            ← Dark/light toggle
        └── main.js             ← Fetches + renders all posts
```

---

## Deploying to Netlify

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USER/vagabond.git
git push -u origin main
```

### 2. Connect to Netlify
1. Go to [netlify.com](https://netlify.com) → **Add new site** → **Import from Git**
2. Choose your repository
3. Build settings are already in `netlify.toml` — no changes needed
4. Click **Deploy**

### 3. Enable Identity + Git Gateway
1. In Netlify dashboard → **Site settings → Identity** → **Enable Identity**
2. Under **Registration** → set to **Invite only**
3. Scroll to **Services → Git Gateway** → **Enable Git Gateway**
4. Go to **Identity** tab → **Invite users** → invite yourself

### 4. Connect your custom domain
1. Netlify dashboard → **Domain settings** → **Add custom domain**
2. Add `thevagabond.blog`
3. Update your DNS to point to Netlify (they'll guide you)
4. SSL is provisioned automatically — fixes the certificate issue

---

## Writing New Posts

### Via CMS (recommended)
1. Go to `https://yoursite.netlify.app/admin`
2. Log in with your Netlify Identity account
3. Click a collection (Stories / Poems / Ideas)
4. Click **New** — write, save, publish
5. Netlify rebuilds automatically; `generate-index.js` updates the manifest

### Manually
1. Create a `.md` file in `content/{category}/`
2. Use this frontmatter:
   ```markdown
   ---
   title: "Your Title"
   date: "2026-03-24"
   description: "One line summary."
   ---

   Your content here...
   ```
3. Run `node generate-index.js` to update `index.json`
4. Commit and push

---

## Customising

### Social links
Edit `assets/js/config.js`:
```js
social: [
  { label: 'Instagram', url: 'https://instagram.com/yourhandle' },
  { label: 'Twitter',   url: 'https://twitter.com/yourhandle' },
],
```

### Homepage post count
Also in `config.js`:
```js
homepagePostCount: 8,
```

### Colours / typography
All in `assets/css/style.css` under `:root` (dark) and `[data-theme="light"]`.

---

## How Posts Are Loaded

1. `main.js` reads `content/{category}/index.json` → list of slugs
2. Fetches each `content/{category}/{slug}.md`
3. Parses YAML frontmatter + Markdown body
4. Renders into the DOM

No build step, no bundler, no framework.
