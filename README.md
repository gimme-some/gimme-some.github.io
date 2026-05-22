# Personal Homepage
 
A minimalist academic homepage template, hosted on GitHub Pages. Comes with an in-browser admin panel for editing content, design, and images — no rebuild, no local setup, no SSG required.
 
## Features
 
- **Static site, zero build step.** Plain HTML, CSS, and vanilla JS. Hosts cleanly on GitHub Pages for free.
- **JSON-driven content.** All page content lives in `data.json`. Edit by hand, or use the admin panel.
- **Admin panel with live preview.** Visit `/admin/` to edit the site. Sign in with a GitHub Personal Access Token; changes commit to your repo. A right-pane preview reflects edits instantly (no GitHub round trip).
- **Design controls.** Accent colors (light & dark mode), font families, font sizes, and weights are tunable from the admin panel. Choose from a curated set of fonts loaded via Google Fonts and Pretendard.
- **Image upload.** Profile photo, publication thumbnails, and project images can be uploaded directly from the admin panel. Old images at the same slot are replaced automatically, so the `assets/` folder stays tidy.
- **Light & dark mode.** A theme toggle is built in, with the user's preference persisted.
- **Korean-friendly typography.** Pretendard is the default sans-serif, with English fallbacks chosen to feel consistent across scripts.
## Structure
 
```
.
├── index.html              # main page
├── styles.css              # design tokens + layout
├── render.js               # reads data.json and renders the page
├── data.json               # all site content + design tokens
├── .nojekyll
├── admin/
│   ├── index.html          # admin editor + live preview
│   └── admin.js            # GitHub API client + form bindings
└── assets/
    ├── profile.svg
    ├── paper-placeholder.svg
    └── project-placeholder.svg
```
 
## Setup
 
1. Create a GitHub repository named `<your-username>.github.io`.
2. Copy these files into the repo and push.
3. Go to **Settings → Pages** and confirm Pages is serving from the `main` branch.
4. Visit `https://<your-username>.github.io` to see the site, and `/admin/` to edit it.
To sign in to the admin panel, create a GitHub Personal Access Token with `contents:write` permission on this repository, then paste it into the login form.
 
## Editing content
 
Either:
 
- Edit `data.json` directly and push, or
- Use `/admin/` for a form-based editor that commits to GitHub on save.
The schema covers profile information, an about section, a list of links, news entries, publications, and projects. The `design` object holds theme tokens (colors, fonts, sizes, weights); all keys are optional and fall back to sensible defaults.
 
## Notes
 
- Image uploads commit to `assets/<slot>.<ext>` (e.g., `assets/pub-0.png`). Re-uploading at the same slot overwrites the previous file, so nothing accumulates.
- After saving, GitHub Pages takes 30–60 seconds to rebuild before changes are live at your URL. The admin panel's live preview, however, updates immediately.
- The admin panel runs entirely in the browser; no server is involved beyond GitHub's API.
## License
 
Made by Min-Seong Kim (gimme-some)

Free to use, modify, and adapt.
