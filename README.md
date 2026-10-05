# ResumeStudio

AI resume builder, ATS score checker, AI resume analyzer and PDF / image / Word document editor — with a free daily plan and a one-time **PKR 99 lifetime** upgrade paid by JazzCash, Easypaisa or bank transfer.

**Stack:** Angular 21 (standalone, signals, zoneless) · NestJS 12 (ESM) · Supabase PostgreSQL 17 · TypeORM 1.x · OpenRouter (Claude Sonnet 5.5 by default)

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
| **Plans & payments** | Free: 1 new resume, 1 cover letter and 1 document edit per day. Lifetime (PKR 99, one-time): unlimited. A separate checkout (`/checkout`): online payment gateway as the primary method (activates instantly), and the merchant QR code (JazzCash / Easypaisa / bank, transaction ID + receipt screenshot, approved from the admin panel) as the alternative |

> **AI works in two modes.** With `OPENROUTER_API_KEY` set, every AI feature uses the model in `AI_MODEL` through [OpenRouter](https://openrouter.ai) (structured JSON outputs). Without a key, a built-in rule-based assistant keeps all features working (summaries, bullet rewrites, skills, tailoring, cover letters, resume parsing). The deep “AI analysis” in the ATS checker requires the key.

---

## Project structure

One npm workspace: the Angular app lives in the project root, the API in `backend/`. A single `npm install` in the root installs both (one `package-lock.json`).

```
.
├── src/app/                    # Angular 21 app
│   ├── core/                   # models, services, guards, interceptors, utils
│   ├── shared/resume/          # the resume renderer (all 16 layouts) + styles
│   ├── layout/                 # app shell + public header
│   └── pages/                  # landing, auth, dashboard, templates, builder, ats, documents,
│                               # editor (canvas + rich), cover letter, profile, billing, checkout, admin
├── public/                     # static files: fonts, icons, payment QR, PWA manifest
├── scripts/                    # build, fonts, icons, payment QR and APK scripts
├── android/                    # Capacitor Android project (npm run apk)
├── server.js                   # production entry (npm start): runs the API, which also serves the built app
└── backend/                    # NestJS 12 API (ESM)
    ├── .env.example            # every setting, documented
    └── src/
        ├── database/           # Supabase connection, migrations, retries, row level security
        ├── auth/  users/       # JWT auth (bcrypt), sign-in protection (security/), Google & Apple sign-in (oauth/), profile
        ├── templates/          # template catalog generator + seeding + search
        ├── resumes/            # resume CRUD, DOCX/TXT export
        ├── ai/                 # OpenRouter client, prompts, JSON schemas, offline fallback
        ├── ats/                # rule-based ATS scorer, dictionaries, reports
        ├── extraction/         # PDF/DOCX/DOC/RTF/HTML text extraction + Tesseract OCR
        ├── documents/          # uploaded documents + editor state
        ├── export/             # HTML→PDF (puppeteer-core), HTML→DOCX, file conversion
        ├── billing/            # plans, daily limits, AI fair-use cap, QR payments, admin API
        ├── checkout/           # online checkout: orders, payment gateway adapters (gateways/), webhooks
        └── common/             # shared resume types, text helpers, auth guard
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
# 1) Install everything (Angular app + backend workspace)
npm install

# 2) Settings: copy backend/.env.example to backend/.env and fill in
#    DATABASE_URL + DATABASE_PASSWORD (see "Database (Supabase)"), JWT_SECRET and OPENROUTER_API_KEY

# 3) Backend (http://localhost:3000/api)
cd backend
npm run db:check     # optional: tests the connection and says what to fix
npm run start:dev

# 4) Frontend (http://localhost:4200) — in a second terminal, from the project root
npm run start:dev
```

Open **http://localhost:4200**, create an account and start building.
On first start the backend connects in the background, creates the tables with migrations, locks them against Supabase's public Data API and seeds the 4,608 templates. `GET /api/health` shows the database state.

### Database (Supabase)

- **Connection string.** Supabase → your project → **Connect** → *Direct* → **Session pooler** (port 5432, works on IPv4-only hosts such as Hostinger; `db.<project>.supabase.co` is IPv6-only). The user must look like `postgres.<project-ref>`. Paste the string unchanged into `DATABASE_URL` and put the password in `DATABASE_PASSWORD` — no URL-encoding needed. A complete URL with the password inside works too, and so does `SUPABASE_URL` + `DATABASE_PASSWORD` (the pooler host is derived; set `SUPABASE_REGION` if the project is not in `ap-southeast-1`).
- **SSL** is automatic and verified: Supabase signs its certificates with a private CA, which ships in `backend/src/database/supabase-ca.ts`. `DATABASE_SSL=no-verify` still encrypts but skips the certificate check.
- **Schema = migrations.** `backend/src/database/migrations` is applied at every start, under a lock, so it is safe with several app processes. After changing an entity: `cd backend && npm run migration:generate -- src/database/migrations/<Name>`, then add the new class to `migrations/index.ts`. `npm run migration:show` lists what is applied. `DB_SYNC=true` (TypeORM changing tables directly) is for local experiments only.
- **Data API locked.** Supabase serves every table in `public` over its REST/GraphQL API to anyone with the project's anon key. All app tables have row level security switched on without policies and the `anon`/`authenticated` grants removed, so only the backend (the tables' owner) can read users, payments and resumes. The Security Advisor may list "RLS enabled, no policy" — that is intended.
- **Startup never waits for the database.** The server starts, `/api/health` reports `connecting` / `retrying` / `misconfigured` with `dbError` and `dbHint`, other API calls answer 503 until the database is ready, and connecting is retried with backoff (every 5 minutes after a wrong password, because the pooler temporarily blocks hosts that keep failing to log in).
- **Hostinger / any host:** set `DATABASE_URL` and `DATABASE_PASSWORD` as environment variables (hPanel → your Node.js app → Environment variables), redeploy, then open `https://<your-domain>/api/health`.
- Free Supabase projects pause after a week without activity; restore them in the dashboard.

### AI (OpenRouter)

```env
OPENROUTER_API_KEY=sk-or-v1-...            # https://openrouter.ai/keys — the account needs credits
AI_MODEL=anthropic/claude-sonnet-5.5       # default; any OpenRouter model with structured outputs
# AI_FALLBACK_MODELS=anthropic/claude-haiku-4.5   # optional backups when the main model is down
```

Restart the backend; the AI panel in the builder then shows “AI writing is active”. Every request asks for JSON that matches a schema (`backend/src/ai/ai.schemas.ts`), is routed only to providers that enforce it, and is retried on rate limits and provider errors. A model without structured-output support still works: the schema then goes into the prompt. Cheaper: `anthropic/claude-haiku-4.5` ($1 / $5 per million input / output tokens, vs $2 / $10 for Sonnet 5.5); best quality: `anthropic/claude-opus-5.5`. Without credits OpenRouter refuses paid models and the app says so; set a spending limit on the key in the OpenRouter dashboard.

### Sign-up & sign-in protection

Everything below is built in and on by default — no third-party service or key is needed (`backend/src/auth/security/`).

| Threat | Protection |
| --- | --- |
| Bots and scripted attacks | Every sign-in and sign-up carries a solved **proof of work** (`GET auth/challenge`, ALTCHA-style SHA-256 puzzle, single use, 10 minutes). The app solves it in the background while the visitor types (~0.1–0.5 s, WebCrypto with a built-in fallback), so people never see it; scripts that do not run the app's code are refused. A hidden **honeypot** field catches form-filling bots. |
| Password guessing / credential stuffing | Sliding-window **lockouts** with escalating durations: one email from one network 5 tries / 15 min, one email from any network 20 / hour, one network 50 / 15 min. The app shows a countdown (HTTP 429 with `retryAfter`). Unknown emails are locked the same way, so a lock reveals nothing. Rate limits per IP on top (10 sign-ins/sign-ups per minute). |
| Account discovery | Wrong password and unknown email give the same answer in the same time (a bcrypt comparison runs either way). Sign-up's "email already registered" answer is limited to 10 per network per hour. |
| Fake-account farming | At most 20 new accounts per network per hour, plus the proof of work and honeypot. |
| Weak passwords | At least 8 characters (max 72 bytes, bcrypt's limit); refused when common (global and Pakistani lists), a repeated pattern or keyboard run, or based on the name, the email or "ResumeStudio"; and checked against the **Have I Been Pwned** breach corpus (k-anonymity: only 5 hex characters of the SHA-1 leave the server; skipped if the service is unreachable). |
| Password storage | bcrypt cost 11 (older hashes are upgraded at the next sign-in); hashing runs at most 2 at a time with a bounded queue, so a flood of sign-ins cannot freeze the server. |
| Stolen or old sessions | Tokens are HS256-only JWTs carrying the account's session version: **changing the password signs out every other device**, *Profile → Sign out of all devices* ends them all, and tokens of deleted accounts stop working. |
| Oversized requests | Bodies over 16 KB to `/api/auth/*` are refused before they are parsed. |

Behind a proxy (Hostinger) set `TRUST_PROXY=1`, otherwise every visitor shares the proxy's IP and lockouts hit everyone together — the server log warns when it sees forwarded requests without it. Emails are logged masked (`s***@gmail.com`).

### Sign in with Google / Apple

The log-in and sign-up pages show **Continue with Google** and **Continue with Apple** for every provider that has credentials (`GET auth/providers`); without them the buttons stay hidden. It works on the website and in the Android app (there the sign-in runs in the phone's browser and comes back through the app's deep link `com.resumestudio.app://oauth`).

How it works (`backend/src/auth/oauth/`, OpenID Connect authorization code flow):

1. The app keeps a random verifier and sends only its SHA-256 (PKCE) to `GET auth/oauth/:provider/start`, which remembers it with a single-use state and nonce and sends the browser to Google / Apple.
2. The provider returns to `auth/oauth/:provider/callback` (Google: GET, Apple: form POST). The API exchanges the code server-to-server (Google with its own PKCE, Apple with an ES256 client secret signed with your key), verifies the ID token — signature against the provider's published keys, issuer, audience, expiry, nonce — and finds, links or creates the account. The browser only gets a one-time code (2 minutes).
3. `POST auth/oauth/exchange` trades that code plus the app's verifier for a session. A stolen or planted callback link is useless without the verifier (no login CSRF, no deep-link interception).

Accounts: a returning Google / Apple account signs into the account it is linked to. Otherwise a **verified** email links to the account with that email, or a new password-less account is created (it can add a password in *Profile → Sign-in & security*). An email + password account whose email was never verified loses its password and sessions when the email's verified owner signs in with Google / Apple — whoever registered someone else's address beforehand ("pre-hijacking") keeps nothing; the owner sees a notice and can set a new password.

**Google setup** — [Google Cloud console](https://console.cloud.google.com/) → *APIs & Services*:

1. *OAuth consent screen*: app name, support email, your domain; scopes `openid`, `email`, `profile`; publish the app.
2. *Credentials → Create credentials → OAuth client ID → Web application*. Authorized redirect URIs: `https://YOUR-DOMAIN/api/auth/oauth/google/callback` (for local development also `http://localhost:4200/api/auth/oauth/google/callback`).
3. Put the client ID and secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

**Apple setup** — [Apple Developer](https://developer.apple.com/account/resources) (paid membership; Apple only allows https return URLs, so it cannot be tried on localhost):

1. *Identifiers → App IDs*: an App ID with **Sign in with Apple** enabled.
2. *Identifiers → Services IDs*: a new Services ID (e.g. `com.resumestudio.web`) → enable Sign in with Apple → *Configure*: primary App ID from step 1, domain `YOUR-DOMAIN`, return URL `https://YOUR-DOMAIN/api/auth/oauth/apple/callback`.
3. *Keys*: a new key with Sign in with Apple → download the `.p8` file (only once) and note its Key ID.
4. Set `APPLE_CLIENT_ID` (the Services ID), `APPLE_TEAM_ID` (top right of the developer account), `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY` (the whole `.p8` file; in a one-line env field write the line breaks as `\n`).

`FRONTEND_URL` (its first entry) must be the public https address: the callback URLs above are built from it. Restart the API; the log says `Social sign-in: Google and Apple.`

### Pricing, payments & admin

| Plan | Limits |
| --- | --- |
| **Free** | Per day: 1 new resume (blank, template, AI-generated, imported or duplicated), 1 cover letter, 1 document edit (upload, blank document, or saving changes to a document — the same document can be edited all day). Templates, ATS checker and downloads are included. |
| **Lifetime** | One-time `LIFETIME_PRICE_PKR` (default **PKR 99**): no daily limits. |

Limits reset at midnight in `APP_TIMEZONE` (default `Asia/Karachi`). When a limit is reached the API answers **HTTP 402** and the app shows the upgrade dialog. Filling an *existing* resume with AI or an imported file does not use the daily resume.

**AI fair-use cap.** Every AI model call (writing, tailoring, parsing, cover letters, ATS deep review) counts towards `AI_DAILY_LIMIT_FREE` (default 20) or `AI_DAILY_LIMIT_LIFETIME` (default 100) per user per day (**HTTP 429** when used up). The offline assistant is not counted. This protects your OpenRouter bill — a one-time PKR 99 cannot pay for unlimited AI calls.

**Checkout** (`/checkout`, a full page outside the app shell) offers two ways to pay. Every "Upgrade" / "Go lifetime" button leads there; **Plan & billing** (`/app/billing`) shows the plan, today's usage and payment status.

1. **Pay online (primary)** — through the payment gateway set in `PAYMENT_GATEWAY`. The buyer pays on the gateway's secure page and comes back to `/checkout/result`; lifetime access is activated automatically as soon as the gateway confirms the payment. Until a gateway is connected, checkout shows this option as *Coming soon* and selects the QR code.
2. **Scan QR & pay (additional)** — one merchant QR code (JazzCash + Raast, so every wallet and bank app can scan it) from `public/payment/`, verified by hand:
   1. The user scans the QR, pays, and submits the transaction ID, the number they paid from and (optionally) a receipt screenshot.
   2. An admin (a logged-in user whose email is in `ADMIN_EMAILS`) opens **Admin** (`/app/admin`), checks the transaction in the JazzCash / Easypaisa / bank app and clicks **Approve** — the user gets lifetime access immediately — or **Reject** with a reason (the user can resubmit). Admins can also grant or revoke lifetime access from the Users tab.

   To change the QR: `npm run payment-qr -- path/to/new-qr.jpg`, then update `PAYMENT_QR` (merchant name, till ID, size) in `src/app/pages/checkout/qr-payment.ts`. In `backend/.env` set `ADMIN_EMAILS` and, optionally, `SUPPORT_WHATSAPP`.

A transaction ID can only be used once (unless rejected), and a user can have one pending QR payment at a time. Online payments land in the same payments ledger (method *Online payment*, already approved), so they show up in the admin list and the revenue total.

**How an online payment is processed** (`backend/src/checkout/`)

- `POST checkout/orders` creates an order (`checkout_orders` table, price locked, valid 30 minutes) and a session with the gateway, and returns a pay link. `GET checkout/orders/:id/pay` sends the browser to the gateway — a redirect, or an auto-submitted form for gateways that expect a POST. In the Android app the payment opens in the phone's browser.
- The gateway reports back through the return URL (`checkout/return/:gateway`, GET or POST, with the buyer), its webhook (`checkout/webhook/:gateway`, server to server) and, if it has one, its status API (asked while the result page waits). Every report is verified by the gateway adapter (signature or a direct check with the gateway); the amount and currency must match the order.
- Fulfilment runs in a database transaction with a row lock: the order becomes *paid*, one approved row is added to `payments` (method `gateway`) and the user gets lifetime access. Repeated or late reports of the same payment change nothing; a payment confirmed after the buyer cancelled or the order expired still counts.
- **Connecting the real gateway**: implement the `PaymentGateway` interface (`backend/src/checkout/gateways/gateway.types.ts`: create a session, verify the return data and webhooks, optionally fetch a status) in a new file next to `mock.gateway.ts`, register it in `gateway.registry.ts`, and set `PAYMENT_GATEWAY` plus its credentials. Give the gateway `FRONTEND_URL/api/checkout/webhook/<key>` as the notification URL; buyers return to `FRONTEND_URL/api/checkout/return/<key>`, so the first `FRONTEND_URL` must be the public site address.
- **Testing**: `PAYMENT_GATEWAY=mock` turns on a built-in test gateway whose page offers *Pay*, *Decline* and *Cancel*, with HMAC-signed results that go through the same verification and fulfilment. It refuses to start when `NODE_ENV=production`.

---

## Configuration (`backend/.env`)

`backend/.env.example` lists every setting with comments. In production the same names go into the hosting panel's environment variables.

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | API port |
| `FRONTEND_URL` | `http://localhost:4200` | Allowed CORS origins (comma separated). The first one is also the public site address the payment gateway returns buyers to |
| `TRUST_PROXY` | — | `1` behind a reverse proxy (Hostinger, Nginx) so rate limits see the real visitor IP |
| `DATABASE_URL` | — | Postgres connection string, e.g. Supabase's "Session pooler" string. May keep `[YOUR-PASSWORD]`. Overrides the individual settings |
| `DATABASE_PASSWORD` | — | Database password, used when `DATABASE_URL` has none or the placeholder (no URL-encoding) |
| `DATABASE_HOST/PORT/USER/NAME` | — / `5432` / `postgres` / `postgres` | Individual settings when `DATABASE_URL` is empty |
| `SUPABASE_URL` / `SUPABASE_REGION` | — / `ap-southeast-1` | Alternative to `DATABASE_URL`: derives that project's session pooler |
| `DATABASE_SSL` | automatic | `true`, `false`, `verify` or `no-verify`. Automatic: off for local hosts, on (and verified for Supabase) otherwise |
| `DATABASE_SSL_CA` | — | Extra CA certificate for another provider (file path or PEM text) |
| `DATABASE_MAX_CONNECTIONS` | `5` | Connection pool size (the Supabase free plan allows 15 in total) |
| `DB_SYNC` | `false` | `true` lets TypeORM alter tables straight from the entities — local experiments only; migrations create the schema |
| `JWT_SECRET` | random per start | Long random secret for signing login tokens. Without it, logins end at every restart — set it in production and keep it private |
| `JWT_EXPIRES_IN_DAYS` | `7` | Session length |
| `AUTH_PROOF_OF_WORK` | `true` | Invisible proof-of-work check on sign-in and sign-up (`false` only to debug) |
| `AUTH_POW_MAX_NUMBER` | `50000` | Proof-of-work difficulty (average hashes = half of it) |
| `PASSWORD_BREACH_CHECK` | `true` | Refuse new passwords found in the Have I Been Pwned breach corpus |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | Sign in with Google (OAuth client of type *Web application*); both or Google stays off |
| `APPLE_CLIENT_ID` / `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY` | — | Sign in with Apple: Services ID, team ID, key ID and the `.p8` key (`\n` for line breaks); all four or Apple stays off |
| `OPENROUTER_API_KEY` | — | Enables the AI model for all AI features (offline assistant without it) |
| `AI_MODEL` | `anthropic/claude-sonnet-5.5` | OpenRouter model id |
| `AI_FALLBACK_MODELS` | — | Comma-separated backup model ids |
| `UPLOAD_DIR` | `uploads` | Where uploaded documents and payment screenshots are stored |
| `CHROME_PATH` | auto-detect | Chrome / Edge / Chromium executable for PDF export |
| `LIFETIME_PRICE_PKR` | `99` | One-time price of lifetime access |
| `FREE_DAILY_RESUMES` / `FREE_DAILY_COVER_LETTERS` / `FREE_DAILY_DOCUMENTS` | `1` / `1` / `1` | Free-plan daily limits (`-1` = unlimited) |
| `APP_TIMEZONE` | `Asia/Karachi` | When daily limits reset (midnight) |
| `AI_DAILY_LIMIT_FREE` / `AI_DAILY_LIMIT_LIFETIME` | `20` / `100` | AI requests per user per day (`-1` = unlimited) |
| `PAYMENT_GATEWAY` | — (off) | Online payment gateway for checkout (adapter key from `backend/src/checkout/gateways/`). Off: checkout shows *Pay online* as coming soon and offers the QR code. `mock` = built-in test gateway (never with `NODE_ENV=production`) |
| `SUPPORT_WHATSAPP` | — | Optional WhatsApp number for payment questions (`03001234567` or `923001234567`) |
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
| `GET auth/challenge`, `POST auth/register`, `POST auth/login`, `GET/PATCH auth/me`, `POST auth/change-password`, `POST auth/logout-all` | Authentication (proof-of-work challenge, sign-up/in, profile, password change or first password, sign out everywhere) |
| `GET auth/providers`, `GET auth/oauth/:provider/start`, `GET/POST auth/oauth/:provider/callback`, `POST auth/oauth/exchange` | Sign in with Google / Apple (`:provider` = `google` or `apple`) |
| `GET templates`, `GET templates/meta`, `GET templates/:id` | Template catalog (public) |
| `GET/POST resumes`, `GET/PATCH/DELETE resumes/:id`, `POST resumes/:id/duplicate`, `GET resumes/:id/export/docx`, `GET resumes/:id/export/txt` | Resumes |
| `GET ai/status`, `POST ai/generate-resume`, `POST ai/parse-resume`, `POST ai/summary`, `POST ai/improve`, `POST ai/bullets`, `POST ai/skills`, `POST ai/tailor`, `POST ai/cover-letter` | AI features |
| `POST ats/analyze-file`, `POST ats/analyze-resume`, `POST ats/analyze-text`, `GET ats/reports`, `GET/DELETE ats/reports/:id` | ATS checker |
| `GET documents`, `POST documents/upload`, `POST documents`, `GET/PATCH/DELETE documents/:id`, `GET documents/:id/file`, `GET documents/:id/html`, `POST documents/:id/extract-text`, `POST documents/extract-text` | Documents |
| `POST export/pdf`, `POST export/docx`, `POST export/convert`, `GET export/status` | Exports & conversions |
| `GET billing/config` (public), `GET billing/me`, `POST billing/payments` | Price, payment accounts, today's usage, submit a QR payment |
| `GET checkout/config` (public), `POST checkout/orders`, `GET checkout/orders/:id` (public), `GET checkout/orders/:id/pay`, `GET/POST checkout/return/:gateway`, `POST checkout/webhook/:gateway` | Online checkout: gateway info, start a payment, order status, open the gateway, gateway return and webhook |
| `GET admin/stats`, `GET admin/payments?status=`, `GET admin/payments/:id/screenshot`, `POST admin/payments/:id/approve`, `POST admin/payments/:id/reject`, `GET admin/users?search=`, `POST admin/users/:id/plan` | Admin (emails in `ADMIN_EMAILS` only) |
| `GET health` | Database / AI / PDF engine status |

---

## Tests

```bash
cd backend
npm test        # ATS scorer, template catalog, offline AI, DOCX, billing/limits and database settings unit tests (Vitest)
```

---

## Production notes

The app runs as one Node.js process: `npm start` (`server.js`) starts the API, which also serves the built Angular app from `dist/frontend/browser` on the same domain.

1. **Hostinger Node.js app** (or any Node 22+ host): build command `npm run build` (Angular app + API), start command `npm start`.
2. **Environment variables** (hPanel → Node.js app → Environment variables): `DATABASE_URL`, `DATABASE_PASSWORD`, `JWT_SECRET` (a new long random value), `OPENROUTER_API_KEY`, `AI_MODEL`, `ADMIN_EMAILS`, `SUPPORT_WHATSAPP`, `TRUST_PROXY=1`, `FRONTEND_URL=https://your-domain`. Then open `https://your-domain/api/health`.
3. **Uploads:** each deploy replaces the app folder, so point `UPLOAD_DIR` at an absolute folder outside it, and back it up together with the Supabase database (`payments` + `UPLOAD_DIR/payments` hold the receipt screenshots).
4. **PDF export** needs Chrome/Chromium on the server (`CHROME_PATH`); without one, downloads fall back to the browser's print dialog.
5. Schema changes ship as migrations and are applied when the API starts. Rate limiting is built in (stricter on auth and AI routes); serve the site over HTTPS.
6. Watch your OpenRouter usage: keep the `AI_DAILY_LIMIT_*` caps and set a spending limit on the API key.

---

## Performance (low-end phones)

- `src/index.html` picks a **performance tier** before the first paint: `data-perf="lite"` on touch screens, ≤ 4 GB RAM, ≤ 4 CPU cores, Data Saver, 2G or "reduce motion"; otherwise `full`. On `full` devices `PerfService` measures real frame times once and switches to `lite` if the device cannot keep up.
- `lite` (see the block at the end of `src/styles.scss`) turns off backdrop blur, glow layers, cursor effects, view transitions and looping decoration. Layout and colours stay identical; loaders keep moving.
- Try it: open the site with `?perf=lite` or `?perf=full` (remembered in the browser).
- Interface fonts and the icon font are self-hosted in `public/fonts`. After using a new Material Symbols icon run `npm run fonts` — the build prints a warning when an icon is missing from the font.
- The web build ships a service worker (`ngsw-config.json`): repeat visits load from the cache. The API's static file server caches only content-hashed files for a year; everything else (`index.html`, `ngsw.json`, `ngsw-worker.js`, the manifest, the payment QR) is revalidated on every request, so new deploys show up at once.

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
- **`/api/health` shows `"database": "misconfigured"` or `"retrying"`** → `dbError` and `dbHint` say what to change (`cd backend && npm run db:check` prints the same locally). Usual causes: a wrong password (reset it in Supabase → Project Settings → Database), a pooler user without `.<project-ref>`, or `db.<project>.supabase.co` on a host without IPv6 (use the session pooler).
- **PDF download falls back to the print dialog** → no Chrome/Edge found; set `CHROME_PATH`.
- **AI shows an error** → the backend log names the OpenRouter answer: `401` wrong `OPENROUTER_API_KEY`, `402` no credits left (add some at openrouter.ai), `404` unknown `AI_MODEL`, `429` rate limit (retried automatically).

---

## Urdu / Hindi quick guide

1. Project folder (root) mein `npm install` — frontend aur backend dono install ho jate hain.
2. `backend/.env.example` ko `backend/.env` mein copy karein. Supabase → apna project → **Connect** → *Session pooler* wali string `DATABASE_URL` mein paste karein (`[YOUR-PASSWORD]` waise hi rehne dein), database password `DATABASE_PASSWORD` mein, aur ek lamba random `JWT_SECRET` likhein. `backend` folder mein `npm run db:check` se connection check karein.
3. `backend` folder mein `npm run start:dev` — tables khud ban jati hain (migrations). Doosre terminal mein root se `npm run start:dev`.
4. Browser mein `http://localhost:4200` kholein, account banayein, template choose karein.
5. AI ke liye `backend/.env` mein `OPENROUTER_API_KEY` (openrouter.ai/keys, account mein credits hone chahiye) aur `AI_MODEL` daalein, phir backend restart karein — bina key ke bhi app offline AI mode mein chalti hai.
6. Payment: alag **Checkout** page (`/checkout`) par do tareeqe hain — **Pay online** (payment gateway, primary; payment confirm hote hi lifetime khud active) aur **Scan QR & pay** (merchant QR, `public/payment/`). Gateway jab tak connect nahi hota, `PAYMENT_GATEWAY` khali rakhein — online option "Coming soon" dikhata hai aur QR chalta rehta hai. Testing ke liye `PAYMENT_GATEWAY=mock` (production mein nahi chalta). Naya QR lagane ke liye `npm run payment-qr -- naya-qr.jpg`. `backend/.env` mein `ADMIN_EMAILS` mein apni email aur `SUPPORT_WHATSAPP` mein apna number daalein.
7. QR se pay karne wala user checkout par Transaction ID submit karta hai. Aap **Admin** page par apne JazzCash/Easypaisa app se TID match karke **Approve** dabayein — user ko foran lifetime access mil jata hai. Online payments admin list mein khud "Approved" aati hain.
8. Google / Apple login: Google Cloud console mein *OAuth client ID (Web application)* banayein, redirect URI `https://aap-ka-domain.com/api/auth/oauth/google/callback` daalein, aur `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` env mein lagayein. Apple ke liye Apple Developer account (paid) mein Services ID + Sign in with Apple key (.p8) banayein, return URL `https://aap-ka-domain.com/api/auth/oauth/apple/callback`, phir `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` lagayein. Jis provider ki settings nahi, uska button nahi dikhta. Tafseel upar "Sign in with Google / Apple" section mein.
9. Android APK: `API_URL=https://aap-ka-domain.com npm run apk` chalayein — file `dist/apk/` mein milegi. `android/keystore/` aur `android/keystore.properties` ka backup zaroor rakhein, warna app update nahi ho sakegi.
