# TrackMyGig (Client + Supabase Functions)

Static front-end (HTML/CSS/JS) powered by Supabase for data and Supabase Edge Functions for secrets (Ticketmaster/OpenAI). Can be hosted on GitHub Pages; no server needed.

## What it does
- Auth + profile stored in Supabase (anon key only in client).
- Browse Ticketmaster shows, favorite, review, journal (badges), notifications.
- Chatbot returns up to 3 shows; falls back to OpenAI (via function) if no events.

## One-time setup (already done on your project)
1) Supabase tables: users, concerts (with genre), favorites, reviews, journal_entries, notifications. RLS disabled or permissive for demo.
2) Edge Functions deployed (project `ugldbwwpjcjtfhlpxbip`):
   - `ticketmaster` with secret `TICKETMASTER_API_KEY`.
   - `chatbot` with secrets `TICKETMASTER_API_KEY`, `OPENAI_API_KEY`.
   URLs:
   - `https://ugldbwwpjcjtfhlpxbip.functions.supabase.co/ticketmaster`
   - `https://ugldbwwpjcjtfhlpxbip.functions.supabase.co/chatbot`

## Local run
```bash
npx serve client
```
Then open the URL shown (e.g., http://localhost:3000).

## Deploy to GitHub Pages
- Publish the `client/` folder. The client uses your Supabase anon key and calls the deployed Edge Functions for Ticketmaster/OpenAI, so no secrets are exposed.
- Files that matter:
  - `client/scripts/supabaseClient.js` (contains anon URL/key).
  - `client/scripts/api.js` (points to the function URLs above).

## Env / keys
- Safe in client: Supabase anon URL/key (already filled).
- Kept server-side in functions: Ticketmaster API key, OpenAI API key (set as Supabase secrets).
- `.gitignore` excludes `.env` so secrets are not committed.

## If you need to reconfigure
- Update anon URL/key in `client/scripts/supabaseClient.js`.
- Update function URLs in `client/scripts/api.js` if you redeploy to a different project/ref.
- To change secrets: `supabase secrets set ... --project-ref <your-ref>`.

## Legacy server
`server/` remains as a legacy Express/SQLite backend (not used for this GH Pages setup). The current app is fully static + Supabase.
