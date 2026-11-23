# Customer Purchasing Intelligence — web app (v1)

Customer module for the demand-first sourcing business. Full design: [../docs/Customer-Module-Design.md](../docs/Customer-Module-Design.md).

## Run it on this computer

```powershell
cd web
npm install
npm run dev
```

Open the address it prints (usually http://localhost:3000). The first visit shows **Create the owner account**. That screen only appears once.

Without `DATABASE_URL`, the app uses an embedded PostgreSQL stored in `web/.data/`. That is for trying the app out only: it is **not backed up**, so do not keep real customer data there.

## Move to the online database

1. Create a PostgreSQL database with a hosting provider (Supabase or Neon both have free tiers).
2. Copy its connection string and put it in `web/.env.local`:
   ```
   DATABASE_URL=postgresql://user:password@host:5432/dbname
   ```
3. Start the app. The tables are created automatically on first start.

## Put the app online (phone + computer)

1. Import the GitHub repository into Vercel, with **Root Directory** set to `web`.
2. Add a Neon Postgres database from Vercel → Storage (it sets `DATABASE_URL` for you), or add `DATABASE_URL` yourself.
3. Add a `SETUP_CODE` environment variable: a long secret phrase only you know. Without it, the setup page stays locked in production.
4. Deploy, open the site, and create the owner account using that setup code.

## What v1 includes

Quick capture with duplicate warnings and GPS · business profile, contacts (with buying and payment authority and contact permission), locations · purchasing profile · product requirements with provenance (basis + verified date), staleness and change history · current sources (supplier names hidden), problems, buying conditions · interactions with "customer said / we observed / our interpretation" kept separate · follow-ups with automatic purchase reminders and "at risk of being forgotten" detection · evidence-weighted opportunity score with explanation · qualification rules · opportunities with commitment levels (verbal ≠ confirmed) and lost reasons · demand view adding up demand by catalog product · product catalog · CSV export.

## Not yet built (see design §13)

Two-factor login · photo/file attachments · CSV import · Visit Mode · Ethiopian calendar display · offline capture · quotations, orders and payments.

## Code map

- `src/lib/schema.ts` — database tables (migrations run automatically)
- `src/lib/options.ts` — all dropdown values
- `src/lib/scoring.ts` — opportunity score, qualification and staleness rules
- `src/lib/actions/` — everything that saves data (validated on the server)
- `src/app/(app)/` — screens
