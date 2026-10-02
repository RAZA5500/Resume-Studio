# ResumeStudio

AI resume builder, ATS score checker, AI resume analyzer and PDF / image / Word document editor — with a free daily plan and a one-time **PKR 99 lifetime** upgrade paid by JazzCash, Easypaisa or bank transfer.

**Stack:** Angular 21 (standalone, signals, zoneless) · NestJS 12 (ESM) · PostgreSQL 17 · TypeORM 1.x · Anthropic Claude

---

## Features

| Area | What you get |
| --- | --- |
| **Resume builder** | Live preview, drag-to-reorder sections, custom sections, photo upload, undo/redo, autosave, page-break guides, A4/Letter |
| **Templates** | **4,608 templates** = 16 layouts × 24 color palettes × 12 font pairings, filter by category / layout / color / font / ATS / photo / columns, search, pagination |
| **Full customization** | Colors (primary, accent, text, page, sidebar), heading & body fonts, font size, line height, margins, section spacing, heading style (7), bullet style (6), skills display (6), header alignment, icons, photo shape, date format |
| **AI writer** | Generate a full resume from a description, write summaries, generate/improve bullets, add metrics, fix grammar, suggest skills, tailor the resume to a job description, write cover letters, import & parse an old resume (PDF/Word/image) |
| **ATS checker** | Upload PDF / DOCX / DOC / TXT / RTF / HTML / images (OCR) or scan a builder resume. 100-point score over 7 categories, job-description keyword matching, issue list with fixes, “what the ATS sees” text view, history |
| **AI analyzer** | Recruiter-style review: strengths, weaknesses, prioritised suggestions, bullet rewrites, rewritten summary, job-fit score, recommended roles |
| **Exports** | Text-based (ATS readable) PDF via headless Chrome/Edge, Word (.docx), plain text, browser print |
| **PDF & image editor** | Edit existing PDF text, add text, whiteout, draw, highlight, shapes, arrows, images, signature (draw/type), stamps, layers, align, lock, rotate/crop/flip photos, filters (brightness, contrast, saturation, hue, blur, B&W, sepia, vintage, invert), page add/duplicate/reorder/rotate/delete, undo/redo, OCR, export PDF (smart or flattened) / PNG / JPG / WebP |
| **Rich text editor** | Word-style editor for DOCX/DOC/TXT/MD/RTF/HTML files or blank docs, AI rewrite of selected text (improve, grammar, shorten, expand, translate/custom), export PDF / DOCX / HTML / TXT |
| **File tools** | Merge PDFs, extract pages, images → PDF, PDF → images, Word → PDF, PDF → Word, image → text (OCR) |
| **Plans & payments** | Free: 1 new resume, 1 cover letter and 1 document edit per day. Lifetime (PKR 99, one-time): unlimited. Manual JazzCash / Easypaisa / bank payments with transaction ID + receipt screenshot, approved from the admin panel |

> **AI works in two modes.** With `ANTHROPIC_API_KEY` set, every AI feature uses Claude (structured JSON outputs). Without a key, a built-in rule-based assistant keeps all features working (summaries, bullet rewrites, skills, tailoring, cover letters, resume parsing). The deep “AI analysis” in the ATS checker requires the key.

---

## Project structure

```
.
├── docker-compose.yml          # PostgreSQL 17
├── backend/                    # NestJS 12 API (ESM)
│   └── src/
│       ├── auth/  users/       # JWT auth (bcrypt), profile, change password
│       ├── templates/          # template catalog generator + seeding + search
│       ├── resumes/            # resume CRUD, DOCX/TXT export
│       ├── ai/                 # Claude client, prompts, JSON schemas, offline fallback
│       ├── ats/                # rule-based ATS scorer, dictionaries, reports
│       ├── extraction/         # PDF/DOCX/DOC/RTF/HTML text extraction + Tesseract OCR
│       ├── documents/          # uploaded documents + editor state
│       ├── export/             # HTML→PDF (puppeteer-core), HTML→DOCX, file conversion
│       ├── billing/            # plans, daily limits, AI fair-use cap, manual payments, admin API
│       └── common/             # shared resume types, text helpers, auth guard
└── frontend/                   # Angular 21 app
    └── src/app/
        ├── core/               # models, services, guards, interceptors, utils
        ├── shared/resume/      # the resume renderer (all 16 layouts) + styles
        ├── layout/             # app shell + public header
        └── pages/              # landing, auth, dashboard, templates, builder, ats, documents,
                                # editor (canvas + rich), cover letter, profile, billing, admin
```

---

## Requirements

- **Node.js 22.12+** (Angular 21).
- **Supabase PostgreSQL** (or any PostgreSQL 14+ database).
- **Google Chrome or Microsoft Edge** installed (used for server-side PDF export; auto-detected).
- Internet access for Google Fonts, and on first OCR run to download Tesseract language data (~10 MB, cached in `backend/.cache`).

---

## Quick start

```bash
# 1) Configure Supabase Database
# In backend/.env, set your Supabase connection string:
# DATABASE_URL=postgresql://postgres:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require
# DATABASE_SSL=true

# 2) Backend (http://localhost:3000/api)
cd backend
npm install
npm run start:dev

# 3) Frontend (http://localhost:4200) — in a second terminal
cd frontend
npm install
npm start
```

Open **http://localhost:4200**, create an account and start building.
On first start, the backend automatically connects to Supabase, synchronizes all tables, and seeds the 4,608 templates. (Or execute `backend/supabase_schema.sql` directly in your Supabase SQL Editor).

### Enable Claude AI

Edit `backend/.env`:

```env
ANTHROPIC_API_KEY=sk-ant-...
AI_MODEL=claude-opus-5-5        # best quality, or claude-sonnet-5 for lower cost
```

Restart the backend. The AI panel in the builder then shows “Claude AI is active”.

### Pricing, payments & admin

| Plan | Limits |
| --- | --- |
| **Free** | Per day: 1 new resume (blank, template, AI-generated, imported or duplicated), 1 cover letter, 1 document edit (upload, blank document, or saving changes to a document — the same document can be edited all day). Templates, ATS checker and downloads are included. |
| **Lifetime** | One-time `LIFETIME_PRICE_PKR` (default **PKR 99**): no daily limits. |

Limits reset at midnight in `APP_TIMEZONE` (default `Asia/Karachi`). When a limit is reached the API answers **HTTP 402** and the app shows the upgrade dialog. Filling an *existing* resume with AI or an imported file does not use the daily resume.

**AI fair-use cap.** Every Claude call (writing, tailoring, parsing, cover letters, ATS deep review) counts towards `AI_DAILY_LIMIT_FREE` (default 20) or `AI_DAILY_LIMIT_LIFETIME` (default 100) per user per day (**HTTP 429** when used up). The offline assistant is not counted. This protects your Anthropic bill — a one-time PKR 99 cannot pay for unlimited AI calls.

**How a payment works**

1. Put your receiving accounts in `backend/.env` (only methods with a number are shown):
   ```env
   PAYMENT_JAZZCASH_NUMBER=03xxxxxxxxx
   PAYMENT_JAZZCASH_TITLE=Your Name
   PAYMENT_EASYPAISA_NUMBER=03xxxxxxxxx
   PAYMENT_EASYPAISA_TITLE=Your Name
   PAYMENT_BANK_NAME=Meezan Bank
   PAYMENT_BANK_TITLE=Your Name
   PAYMENT_BANK_ACCOUNT=PK00XXXX0000000000000000
   SUPPORT_WHATSAPP=923xxxxxxxxx      # optional
   ADMIN_EMAILS=you@example.com        # comma separated
   ```
2. The user opens **Plan & billing** (`/app/billing`), sends the amount, and submits the transaction ID, the number they paid from and (optionally) a receipt screenshot.
3. An admin (a logged-in user whose email is in `ADMIN_EMAILS`) opens **Admin** (`/app/admin`), checks the transaction in the JazzCash / Easypaisa / bank app and clicks **Approve** — the user gets lifetime access immediately — or **Reject** with a reason (the user can resubmit). Admins can also grant or revoke lifetime access from the Users tab.

A transaction ID can only be used once (unless rejected), and a user can have one pending payment at a time.

---

## Configuration (`backend/.env`)

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | API port |
| `FRONTEND_URL` | `http://localhost:4200` | Allowed CORS origins (comma separated) |
| `DATABASE_URL` | — | Full Postgres URL (Neon, Render, Supabase…). Overrides the individual settings |
| `DATABASE_HOST/PORT/USER/PASSWORD/NAME` | docker-compose values | Postgres connection |
| `DATABASE_SSL` | `false` | `true` for hosted databases that require SSL |
| `DB_SYNC` | `true` | Auto-create/update tables. Use `false` + migrations in production |
| `JWT_SECRET` | random (generated) | Secret for signing tokens — keep it private |
| `JWT_EXPIRES_IN_DAYS` | `7` | Session length |
| `ANTHROPIC_API_KEY` | — | Enables Claude for all AI features |
| `AI_MODEL` | `claude-opus-5-5` | Claude model id |
| `UPLOAD_DIR` | `uploads` | Where uploaded documents and payment screenshots are stored |
| `CHROME_PATH` | auto-detect | Chrome / Edge / Chromium executable for PDF export |
| `LIFETIME_PRICE_PKR` | `99` | One-time price of lifetime access |
| `FREE_DAILY_RESUMES` / `FREE_DAILY_COVER_LETTERS` / `FREE_DAILY_DOCUMENTS` | `1` / `1` / `1` | Free-plan daily limits (`-1` = unlimited) |
| `APP_TIMEZONE` | `Asia/Karachi` | When daily limits reset (midnight) |
| `AI_DAILY_LIMIT_FREE` / `AI_DAILY_LIMIT_LIFETIME` | `20` / `100` | AI requests per user per day (`-1` = unlimited) |
| `PAYMENT_JAZZCASH_NUMBER` / `_TITLE` | — | JazzCash account shown at checkout |
| `PAYMENT_EASYPAISA_NUMBER` / `_TITLE` | — | Easypaisa account shown at checkout |
| `PAYMENT_BANK_NAME` / `_TITLE` / `_ACCOUNT` | — | Bank account / IBAN shown at checkout |
| `SUPPORT_WHATSAPP` | — | Optional WhatsApp number for payment questions (e.g. `923001234567`) |
| `ADMIN_EMAILS` | — | Comma-separated emails that can open `/app/admin` and approve payments |

---

## How the key parts work

**Template catalog** — `backend/src/templates/template-catalog.ts` combines 16 layouts, 24 palettes and 12 font pairings (with deterministic per-template variations of heading, bullet and skill styles, spacing and date format). They are upserted into the `templates` table at startup; bump `CATALOG_VERSION` after changing the generator.

**Resume rendering** — one Angular component (`shared/resume/resume-renderer`) renders every layout from `ResumeContent` + `DesignSettings` using CSS variables. The exact same CSS string is sent to the PDF engine, so the downloaded PDF matches the preview. Page margins repeat on every printed page and sidebar colors continue across pages.

**ATS scoring** — `backend/src/ats/ats-scorer.ts` (unit tested) scores 100 points:
contact info (10), sections (15), keywords (25), impact & action verbs (15), length (10), ATS parseability (15), language & readability (10). Job descriptions are mined for skills, acronyms and repeated terms; image-only PDFs are OCR'd and flagged.

**PDF editing export** — *Smart PDF* keeps untouched pages as the original vector PDF, writes edited/added text as real selectable PDF text, re-renders pages that use whiteout so hidden words also disappear from the text layer, and keeps the remaining original words searchable through an invisible text layer. *Flattened PDF* turns every page into an image (maximum privacy).

---

## API overview (all under `/api`)

| Method & path | Purpose |
| --- | --- |
| `POST auth/register`, `POST auth/login`, `GET/PATCH auth/me`, `POST auth/change-password` | Authentication |
| `GET templates`, `GET templates/meta`, `GET templates/:id` | Template catalog (public) |
| `GET/POST resumes`, `GET/PATCH/DELETE resumes/:id`, `POST resumes/:id/duplicate`, `GET resumes/:id/export/docx`, `GET resumes/:id/export/txt` | Resumes |
| `GET ai/status`, `POST ai/generate-resume`, `POST ai/parse-resume`, `POST ai/summary`, `POST ai/improve`, `POST ai/bullets`, `POST ai/skills`, `POST ai/tailor`, `POST ai/cover-letter` | AI features |
| `POST ats/analyze-file`, `POST ats/analyze-resume`, `POST ats/analyze-text`, `GET ats/reports`, `GET/DELETE ats/reports/:id` | ATS checker |
| `GET documents`, `POST documents/upload`, `POST documents`, `GET/PATCH/DELETE documents/:id`, `GET documents/:id/file`, `GET documents/:id/html`, `POST documents/:id/extract-text`, `POST documents/extract-text` | Documents |
| `POST export/pdf`, `POST export/docx`, `POST export/convert`, `GET export/status` | Exports & conversions |
| `GET billing/config` (public), `GET billing/me`, `POST billing/payments` | Price, payment accounts, today's usage, submit a payment |
| `GET admin/stats`, `GET admin/payments?status=`, `GET admin/payments/:id/screenshot`, `POST admin/payments/:id/approve`, `POST admin/payments/:id/reject`, `GET admin/users?search=`, `POST admin/users/:id/plan` | Admin (emails in `ADMIN_EMAILS` only) |
| `GET health` | Database / AI / PDF engine status |

---

## Tests

```bash
cd backend
npm test        # ATS scorer, template catalog, offline AI, DOCX and billing/limits unit tests (Vitest)
```

---

## Production notes

1. `cd frontend && npx ng build` → deploy `frontend/dist/frontend/browser` to any static host (Nginx, Netlify, Vercel…) and proxy `/api` to the backend (or set a full API URL).
2. `cd backend && npm run build && npm run start:prod`.
3. Set a strong `JWT_SECRET`, `DB_SYNC=false` (generate TypeORM migrations), and persistent storage for `UPLOAD_DIR`.
4. Install Chromium on the server (e.g. `apt install chromium`) and set `CHROME_PATH` for PDF export.
5. Put the API behind HTTPS; rate limiting is already enabled (stricter limits on auth and AI routes).
6. Fill in the `PAYMENT_*` accounts and `ADMIN_EMAILS`, and back up the `payments` table and `UPLOAD_DIR/payments` (receipt screenshots).
7. Watch your Anthropic usage. With a one-time PKR 99 price, prefer `AI_MODEL=claude-sonnet-5` and keep the `AI_DAILY_LIMIT_*` caps.

---

## Performance (low-end phones)

- `src/index.html` picks a **performance tier** before the first paint: `data-perf="lite"` on touch screens, ≤ 4 GB RAM, ≤ 4 CPU cores, Data Saver, 2G or "reduce motion"; otherwise `full`. On `full` devices `PerfService` measures real frame times once and switches to `lite` if the device cannot keep up.
- `lite` (see the block at the end of `src/styles.scss`) turns off backdrop blur, glow layers, cursor effects, view transitions and looping decoration. Layout and colours stay identical; loaders keep moving.
- Try it: open the site with `?perf=lite` or `?perf=full` (remembered in the browser).
- Interface fonts and the icon font are self-hosted in `public/fonts`. After using a new Material Symbols icon run `npm run fonts` — the build prints a warning when an icon is missing from the font.
- The web build ships a service worker (`ngsw-config.json`): repeat visits load from the cache. Never cache `ngsw.json` / `ngsw-worker.js` on the server (`.htaccess` and the Caddyfile already handle this).

---

## Android app (APK)

The Android app is the same Angular build packaged with [Capacitor](https://capacitorjs.com) (`capacitor.config.ts`, `android/`). Pages load from the phone; only API calls use the network.

```bash
API_URL=https://your-domain.com npm run apk                       # production app (bash)
$env:API_URL="https://your-domain.com"; npm run apk               # PowerShell
npm run apk                                                       # test app: asks for the server on first launch
APP_VERSION_NAME=1.1.0 APP_VERSION_CODE=2 npm run apk -- --aab    # next version + Play Store bundle
```

- Output: `dist/apk/ResumeStudio-<version>.apk` (and `.aab` with `--aab`).
- Needs JDK 21 and the Android SDK (`JAVA_HOME`, `ANDROID_HOME`); the script also finds the portable copies in `D:\Android`.
- The first run creates the release signing key: `android/keystore/resumestudio-release.jks` + `android/keystore.properties` (both git-ignored). **Back them up** — every update must be signed with the same key.
- The backend always allows the app's origin (`https://localhost`) in CORS.
- In the app, downloads are saved to *Documents › ResumeStudio* and offered in the share sheet; "print / Save as PDF" uses Android's print service; the back button closes dialogs first.
- Test app with the backend on your PC: the phone and PC must be on the same Wi-Fi; enter `http://<PC IP>:3000` (from `ipconfig`) on the Connect screen and allow Node.js through the Windows firewall.
- The brand mark (an "R" on a page with a folded corner) lives in `scripts/app-icons.mjs`. `npm run icons` writes the favicon (SVG + ICO), the iOS and PWA icons, and the Android launcher icons and splash images as WebP. The logo component and the boot screen inline the same SVG.
- Images: the logo and favicon are SVG (smaller and sharper than any bitmap); document thumbnails and payment screenshots are encoded as WebP in the browser (JPEG on Safari, which cannot write WebP). Resume photos stay JPEG because older Word versions cannot show WebP in the DOCX export.

---

## Dependency notes

`package.json` → `overrides` (npm does not allow comments there):

- `piscina: 5.3.2` — the patched version of a build-time worker pool (GHSA-67c8-pqhq-4rmx). Angular 21's `@angular/build` pins 5.2.0; drop the override after upgrading to Angular ≥ 22.2.
- `xcode → uuid ^11.1.1` — patched `uuid` for the Capacitor CLI's iOS helper (GHSA-w5hq-g745-h8pq).
- `fabric → canvas / jsdom` replaced by an empty package — they only serve fabric under Node.js; the browser build never loads them (saves ~60 packages and a native build step).

`quill@2.0.3` is still reported by `npm audit` (CVE-2025-15056, low): there is no fixed release, and 2.0.2 contains the same code. The flaw is in Quill's video/formula embeds, which the document editor does not allow (`FORMATS` in `rich-editor.ts`); exported HTML is also stripped of scripts, frames and event handlers.

---

## Troubleshooting

- **The project is inside OneDrive.** Syncing `node_modules` (hundreds of thousands of files) slows everything down and can cause `EPERM` errors. Move the folder outside OneDrive or pause syncing while developing.
- **“Cannot reach the server”** in the UI → the backend is not running on port 3000.
- **PDF download falls back to the print dialog** → no Chrome/Edge found; set `CHROME_PATH`.
- **Docker errors** → start Docker Desktop, then `docker compose up -d`.

---

## Urdu / Hindi quick guide

1. Docker Desktop kholein, phir project folder mein `docker compose up -d` chalayein (database).
2. `backend` folder mein `npm install` aur `npm run start:dev`.
3. `frontend` folder mein `npm install` aur `npm start`.
4. Browser mein `http://localhost:4200` kholein, account banayein, template choose karein.
5. Asli Claude AI ke liye `backend/.env` mein `ANTHROPIC_API_KEY` daalein aur backend restart karein — bina key ke bhi app offline AI mode mein chalti hai.
6. Payment lene ke liye `backend/.env` mein apna JazzCash / Easypaisa / bank number (`PAYMENT_*`) aur `ADMIN_EMAILS` mein apni email daalein, phir backend restart karein.
7. User payment bhej kar **Plan & billing** page par Transaction ID submit karta hai. Aap **Admin** page par apne JazzCash/Easypaisa app se TID match karke **Approve** dabayein — user ko foran lifetime access mil jata hai.
8. Android APK: `API_URL=https://aap-ka-domain.com npm run apk` chalayein — file `dist/apk/` mein milegi. `android/keystore/` aur `android/keystore.properties` ka backup zaroor rakhein, warna app update nahi ho sakegi.
