# Kokebok

Private, invite-only recipe collection with shared shopping lists (Norwegian UI).
Recipes are imported from pasted text or photos by Gemini, or written by hand.

**Stack:** Vite + React + TypeScript on Vercel; Supabase (Postgres + RLS, auth,
storage, Edge Functions); Gemini for import.

## Develop

```bash
npm ci
cp .env.example .env    # Supabase URL and anon key
npm run dev
npm test
npm run build
```

## Environment

- **Vercel:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- **Supabase secrets:** `GEMINI_API_KEY` (required); optional `GEMINI_MODEL`,
  `GEMINI_FALLBACK_MODELS`, `GEMINI_THINKING_LEVEL`, `IMPORT_DAILY_LIMIT` (default
  30/user/day), `IMPORT_MAX_CHARS`
- **GitHub (backups):** `SUPABASE_DB_URL`, `BACKUP_PASSPHRASE`

## Notes

- **Import** (`import-recipe` Edge Function): up to 10 images, shrunk on the device
  first. Falls back through `GEMINI_FALLBACK_MODELS` on 429/503 and gives up
  before Supabase's 150 s limit. Billing is on in Google (about 1 cent per import);
  keep a budget alert. Check Gemini's paid-API terms before inviting people
  outside the EEA.
- **PWA and offline:** shopping lists work offline (IndexedDB cache plus a queue of
  edits, `src/lib/shopping-mutations.ts`); recipes do not. Bump `CACHE_BUSTER` in
  `src/lib/cache-persister.ts` when the shape of cached data changes. Icons:
  `scripts/make-icons.ps1`.
- **Oven settings** (`recipes.oven`, a JSON list): filled in by import and Fix with AI,
  editable in the form. The shape is checked by zod (`OvenStepSchema`), not the database.
- **Suggestions:** users send them at `/forslag` and see the status and reply; admins
  answer them on `/admin`.
- **Invite email:** `supabase/templates/invite.html`. The hosted copy lives in the
  Supabase dashboard (Authentication → Emails), so update both.

## Database

- Migrations in `supabase/migrations/`; run `npm run types` after a schema change.
- RLS tests (run after changing policies; rolls back, prints `ALL RLS TESTS PASSED`):
  `psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql`
- Food data: `npm run seed:foods`

## Deploy and backups

Pushes to `main` deploy; CI runs tests and the build. A nightly workflow keeps an
encrypted `pg_dump` for 30 days (storage images not included). Restore:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE -in <file>.dump.enc -out backup.dump
pg_restore --no-owner -d "$TARGET_DB_URL" backup.dump
```
