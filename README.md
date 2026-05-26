# LOI → JDA Conversion Tracker

Static React dashboard for tracking the conversion of Letters of Intent (LOIs) to signed Joint Development Agreements (JDAs).

Each LOI shows:
- LOI signed date
- Working days elapsed against a configurable SLA
- JDA signed status / date
- An issues list capturing anything blocking JDA signing

A global setting controls the **max working days** allowed between LOI signing and JDA signing. LOIs that exceed the SLA turn red.

## Local Run

```powershell
.\start.ps1
```

Open the URL printed in the terminal, usually `http://localhost:3000/`.

## Supabase

1. Run `supabase-setup.sql` in Supabase Dashboard › SQL Editor. The script drops legacy C&I pipeline tables, then creates `lois_ci`, `issues_ci`, and `settings_ci`.
2. Set Supabase credentials for the build (one of):
   - Run `./connect-supabase.ps1 -SupabaseUrl <url> -AnonKey <key>` to write `public/config.js` locally.
   - Or provide `SUPABASE_URL` and `SUPABASE_ANON_KEY` env vars to `node build.js`.

## Build

- Build Command: `npm run build`
- Output Directory: `dist`
