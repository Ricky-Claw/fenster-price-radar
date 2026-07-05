# Conversion Rescue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone embeddable Conversion Rescue product with Express, SQLite, dashboard, demo, analytics, and a dependency-free widget.

**Architecture:** Keep the server runtime in plain CommonJS with focused helper modules for sanitizing, theming, analytics, and SQLite persistence. Serve the widget, dashboard, and demo as static assets while the API handles campaign CRUD, public config, event ingestion, submissions, and analytics summaries.

**Tech Stack:** Node.js, Express, better-sqlite3, vanilla JavaScript, Node test runner

---

### Task 1: Define project entrypoints and failing tests

**Files:**
- Create: `package.json`
- Create: `tests/sanitize.test.js`
- Create: `tests/analytics.test.js`
- Create: `tests/api.test.js`

- [ ] Step 1: Write failing tests for sanitize, analytics, and API behavior.
- [ ] Step 2: Run `npm test` and confirm module-not-found failures.
- [ ] Step 3: Implement the minimum server helpers and app surface to satisfy the tests.
- [ ] Step 4: Re-run `npm test` until green.

### Task 2: Build the shared server modules

**Files:**
- Create: `server/lib/sanitize.js`
- Create: `server/lib/theme.js`
- Create: `server/lib/analytics.js`
- Create: `server/db.js`

- [ ] Step 1: Port and generalize the sanitizers, theme normalization, and funnel logic from the reference files.
- [ ] Step 2: Add SQLite schema creation and parameterized query helpers.
- [ ] Step 3: Verify the tests for sanitizing, analytics, and basic API storage pass.

### Task 3: Implement the HTTP server and product surfaces

**Files:**
- Create: `server/index.js`
- Create: `widget/cre.js`
- Create: `dashboard/index.html`
- Create: `dashboard/styles.css`
- Create: `dashboard/app.js`
- Create: `demo/index.html`
- Create: `README.md`

- [ ] Step 1: Add API routes, admin auth, rate limiting, public config CORS, and static serving.
- [ ] Step 2: Implement the embeddable widget with Shadow DOM, triggers, actions, analytics events, consent, opt-out, and frequency caps.
- [ ] Step 3: Build the dashboard editor, live preview, and analytics display.
- [ ] Step 4: Build the demo page and concise README.

### Task 4: Verify end-to-end behavior

**Files:**
- Modify: `README.md`

- [ ] Step 1: Run `npm install`.
- [ ] Step 2: Run `npm test`.
- [ ] Step 3: Start the server and execute the required curl checks.
- [ ] Step 4: Load the demo in a browser tool if available, otherwise document the manual test path.
