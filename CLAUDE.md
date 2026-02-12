# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WellTrack is a PWA for daily diet, wellness, and fitness tracking. It uses vanilla JavaScript with no frameworks and no build system. Data is stored in Supabase (auth + PostgreSQL). Login is required — there is no offline/localStorage fallback.

## Development

There is no package.json, no npm scripts, and no build step. Files are served as-is.

To develop locally, serve the root directory over HTTP (Service Workers require localhost or HTTPS):
```
python -m http.server 8000
```
Then open http://localhost:8000.

Deployed via GitHub Pages. Push to `master` triggers automatic deploy.

There are no tests or linting configured.

## Architecture

**Single-page app with four screens:** Auth (login/signup), Calendar, Day (daily tracker), and Plan (meal plan editor). Navigation is handled by `showScreen()` which hides/shows screen containers and calls the appropriate async render function.

**All application logic lives in `js/app.js`:**
- Supabase client initialized as `const sb = supabase.createClient(...)` using constants from `js/config.js`
- Central state object `S` holds `userId`, current screen, plan, settings, selected date, and monthly logs cache
- All data access functions (`loadPlan`, `savePlan`, `loadSettings`, `saveSettings`, `loadMonth`, `saveMonth`) are async and interact with Supabase tables
- Saves are debounced at 400ms via `scheduleSave()` → `saveMonth()` (fire-and-forget upsert), flushed on navigation and beforeunload
- Render functions (`renderCalendar`, `renderDay`) are async because they await `loadMonth()`

**Key data flow:** User input → DOM event handler → update `S` or day log → `scheduleSave()` → async Supabase upsert → re-render view

**Auth flow:**
- `sb.auth.onAuthStateChange()` listens for SIGNED_IN / SIGNED_OUT events
- On startup, IIFE checks `getSession()` and routes to `initApp()` or `showAuthScreen()`
- `initApp(userId)` loads plan + settings + current month in parallel via `Promise.all`, then shows calendar
- Auth supports email+password (`signInWithPassword`, `signUp`) and magic link (`signInWithOtp`)
- Logout button is on the Plan screen, calls `sb.auth.signOut()`

**Rendering** uses direct `innerHTML` assignment (no virtual DOM). Each screen has a `render*()` function and a corresponding `attach*Events()` function for event delegation.

**Scoring system** (`calcScore`): Combines a diet score (0-3, based on plan completion and extras) with a steps score (0-3, based on step target). The combined score is the minimum of both. Tiers: gold, silver, bronze, fail.

**Macro display** (`renderMacrosCard`): Day view shows a large calorie number with progress bar, plus horizontal bars for protein, carbs, and fat. Bars turn red when over target. Updated in-place by `updateDayCircles()` when steps change.

## Supabase

**Config:** `js/config.js` contains `SUPABASE_URL` and `SUPABASE_ANON_KEY` (publishable key, safe to commit).

**Database tables** (all have RLS policies restricting access to `auth.uid() = user_id`):
- `plans` — `user_id` (PK), `data` (JSONB), `updated_at`
- `settings` — `user_id` (PK), `data` (JSONB), `updated_at`
- `day_logs` — `(user_id, month_key)` (composite PK), `data` (JSONB), `updated_at`

Schema SQL is in `schema.sql` (run manually in Supabase dashboard SQL Editor).

## Service Worker (`sw.js`)

Uses network-first for HTML and stale-while-revalidate for assets. Supabase API calls (`*.supabase.co`) are skipped entirely — no caching. Cache name is `wellness-tracker-v4` — bump this to force cache invalidation.

## CSS (`css/styles.css`)

Design tokens are defined as CSS variables in `:root`. Layout is flexbox-based. App is constrained to `max-width: 480px` (mobile-first). Safe area insets are handled for notched devices.

## File Structure

| File | Purpose |
|------|---------|
| `index.html` | Shell: loads Supabase CDN, config, app scripts; contains screen divs, loading overlay, navbar |
| `js/config.js` | Supabase URL and anon key constants |
| `js/app.js` | All application logic: auth, data access, rendering, event handling |
| `css/styles.css` | All styles including auth, loading, macros card, plan grid |
| `sw.js` | Service worker with Supabase bypass |
| `schema.sql` | Database schema for Supabase (manual setup) |
| `manifest.json` | PWA manifest |

## Key Conventions

- HTML escaping via `escH()` — always use this when inserting user content into innerHTML
- Event delegation on parent containers using `dataset` attributes for element identification
- `inputmode` attributes on inputs for proper mobile keyboards
- Data export fetches ALL months from Supabase (not just cached); import batch-upserts
- All storage functions are async; callers must await or fire-and-forget as appropriate

## Backlog

- Make layout responsive for wider screens (currently fixed at 480px max-width)
