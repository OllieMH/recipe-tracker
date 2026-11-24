# Kokebok

Private, invite-only recipe collection (Norwegian UI). Paste a recipe from any
site, an LLM turns it into structured data, and you can scale, convert, edit,
copy, print and export it.

## Stack

Vite + React + TypeScript on Vercel. Supabase for Postgres (with RLS), auth,
storage and Edge Functions. Gemini for recipe import.

## Develop

```bash
npm ci
cp .env.example .env    # add your Supabase URL and anon key
npm run dev
npm test
npm run build
```

## Environment

- **Frontend (Vercel):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- **Edge Functions (Supabase secrets):** `GEMINI_API_KEY` (required). Optional:
  `GEMINI_MODEL`, `GEMINI_FALLBACK_MODELS`, `GEMINI_THINKING_LEVEL`,
  `IMPORT_DAILY_LIMIT`, `IMPORT_MAX_CHARS`
- **Backup workflow (GitHub secrets):** `SUPABASE_DB_URL`, `BACKUP_PASSPHRASE`

## Database

- Migrations: `supabase/migrations/`. After a schema change, run `npm run types`.
- RLS tests: `psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql`
  (rolls back; prints `ALL RLS TESTS PASSED`). Run it after changing policies.
- Food data: `npm run seed:foods`.

## Deploy and CI

Pushes to `main` deploy automatically. CI runs tests and the build.

## Backups

A nightly workflow makes an encrypted `pg_dump` (30 days, as a GitHub artifact).
Storage images are not included. Restore:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE -in <file>.dump.enc -out backup.dump
pg_restore --no-owner -d "$TARGET_DB_URL" backup.dump
```
