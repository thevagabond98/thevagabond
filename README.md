# The Vagabond — Setup Guide

## 📁 Folder Structure
```
thevagabond/
├── index.html          ← Homepage
├── about.html          ← About page
├── stories/
│   ├── index.html      ← Stories list page
│   └── *.html          ← Individual story files
├── poems/
│   ├── index.html      ← Poems list page
│   └── *.html          ← Individual poem files
├── ideas/
│   ├── index.html      ← Ideas list page
│   └── *.html          ← Individual idea files
└── assets/
    ├── css/style.css   ← All styles
    └── js/
        ├── posts.js    ← POST DATA (edit this to add posts!)
        └── main.js     ← Renders posts on pages
```

---

## ✍️ How to Add a New Post

### Step 1 — Create the HTML file
Copy `stories/the-ramras.html` as a template.
Save your new file in the right folder (stories / poems / ideas).

### Step 2 — Register it in posts.js
Open `assets/js/posts.js` and add your post to the array:

```js
{
  id: "your-post-slug",
  title: "Your Post Title",
  excerpt: "A short preview of your post (2-3 sentences).",
  category: "stories",        // stories | poems | ideas
  date: "March 2026",
  file: "../stories/your-post-slug.html"
}
```

### Step 3 — Push to GitHub → Netlify auto-deploys → Done! ✅

---

## 🚀 Deploy to Netlify

1. Push this folder to your GitHub repo (`thevagabond`)
2. Go to [netlify.com](https://netlify.com) → New site from Git
3. Connect your GitHub repo
4. Build settings: leave blank (static site)
5. Click Deploy
6. Go to Domain Settings → add your custom domain

---

## 🌐 Custom Domain
In Netlify: Site Settings → Domain Management → Add custom domain
Then update your domain's DNS to point to Netlify (they'll guide you).
