# ResumeStudio AI — Frontend (Angular 21)

Standalone, zoneless Angular app (signals everywhere). See the [root README](../README.md) for the full feature list and setup.

```bash
npm install
npm start            # http://localhost:4200 — proxies /api to http://localhost:3000
npx ng build         # production build in dist/frontend/browser
```

Key folders:

- `src/app/shared/resume` — the resume renderer used for previews, thumbnails and PDF export
- `src/app/pages/builder` — resume builder (content editor, design panel, AI tools, autosave store)
- `src/app/pages/editor` — PDF/image canvas editor (Fabric.js + pdf.js + pdf-lib) and rich-text editor (Quill)
- `src/app/core` — models, API services, guards, interceptors and utilities
