# ResumeStudio AI — Backend (NestJS 12)

REST API for resumes, templates, AI writing, ATS scoring, document storage and exports.
See the [root README](../README.md) for the full feature list and setup.

```bash
npm install
npm run start:dev     # http://localhost:3000/api  (watch mode)
npm test              # unit tests (Vitest)
npm run build && npm run start:prod
```

- Configuration lives in `.env` (see `.env.example`).
- The project is ESM (`"type": "module"`): relative imports use the `.js` extension.
- Tables are created automatically (`DB_SYNC=true`) and the 4,608 templates are seeded on startup.
- `GET /api/health` shows database, AI and PDF-engine status.
