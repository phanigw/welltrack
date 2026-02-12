# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WellTrack is a client-side only PWA for daily diet, wellness, and fitness tracking. It uses vanilla JavaScript with no frameworks, no build system, and no backend. All data is stored in localStorage.

## Development

There is no package.json, no npm scripts, and no build step. Files are served as-is.

To develop locally, serve the root directory over HTTP (Service Workers require localhost or HTTPS):
```
python -m http.server 8000
```
Then open http://localhost:8000.

There are no tests or linting configured.

## Architecture

**Single-page app with three screens:** Calendar, Day (daily tracker), and Plan (meal plan editor). Navigation is handled by `showScreen()` which hides/shows screen containers and calls the appropriate render function.

**All application logic lives in `js/app.js`:**
- Central state object `S` (line ~30) holds current screen, plan, settings, selected date, and monthly logs
- `store.get(key)` / `store.set(key, val)` wraps localStorage (line ~13)
- Monthly logs stored under keys like `log_2025-02`, with day numbers as sub-keys
- Saves are debounced at 400ms via `scheduleSave()`, flushed on navigation and unload

**Key data flow:** User input → DOM event handler → update `S` or day log → `scheduleSave()` → re-render view

**Rendering** uses direct `innerHTML` assignment (no virtual DOM). Each screen has a `render*()` function and a corresponding `attach*Events()` function for event delegation.

**Scoring system** (`calcScore`, line ~204): Combines a diet score (0-3, based on plan completion and extras) with a steps score (0-3, based on step target). The combined score is the minimum of both.

**Macro calculation** (`consumedMacros`, line ~170): Iterates checked plan items, multiplies macros by `actualQty / plannedQty` ratio, then adds extras.

## Service Worker (`sw.js`)

Uses network-first for HTML and stale-while-revalidate for assets. Cache name is `wellness-tracker-v1` — change this to force cache invalidation.

## CSS (`css/styles.css`)

Design tokens are defined as CSS variables in `:root`. Layout is flexbox-based and responsive without media queries. Safe area insets are handled for notched devices.

## Key Conventions

- HTML escaping via `escH()` — always use this when inserting user content into innerHTML
- Event delegation on parent containers using `dataset` attributes for element identification
- `inputmode` attributes on inputs for proper mobile keyboards
- Data export/import produces/consumes JSON files with `plan`, `settings`, and `months` keys
