# GLOBAL SHARES EARN — Admin Portal

This repository contains the separate administrative web application for GLOBAL SHARES EARN.

## Status

The repository is being initialized. Do not use this portal for live financial operations until its authorization policies, server-side RPC permissions, audit trail, and end-to-end tests have been verified.

## Security principles

- Use Supabase Auth; no public admin registration.
- Never trust a role supplied by the browser.
- Enforce every privileged action in PostgreSQL/RPCs, not only in the UI.
- Keep service-role keys out of browser code and Git.
- Use audited, idempotent server-side operations for deposits, withdrawals, adjustments, bonuses, referrals, and profit credits.
- Do not use production customer records as test fixtures.

## Local development

The app will use Vite, React, TypeScript, and the Supabase browser client. Configure only the public project URL and anon/publishable key as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. These variables are public; never put a service-role key in `VITE_*` variables.
