# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

StudyBridge is a small peer-tutoring and student-support app used as a CS5890 teaching
project. Students create support requests, mentors claim and resolve them, and staff add
public or staff-only notes. It is TypeScript on Node 20+ with **zero runtime dependencies**
(`typescript`, `tsx`, and `@types/node` are the only dev deps) and a framework-free browser
client. Work items are GitHub issues on `RyanLewalski/studybridge`, not files in the repo.

## Commands

```bash
npm install
npm run check        # typecheck server + client, then run every test; the standard gate
npm test             # tsx --test tests/*.test.ts
npm run typecheck    # tsc --noEmit for tsconfig.json and tsconfig.client.json
npm run build        # clean, compile server -> dist/, compile client -> public/assets/
npm run dev          # build client, then tsx watch src/server.ts on http://localhost:3000
npm start            # build, then node dist/server.js
npm run reset:data   # delete var/studybridge.json; re-seeded from data/seed.json on next start
```

Run one test file, or one test by name (Node's built-in runner, so `--test-name-pattern` works):

```bash
npx tsx --test tests/requestService.test.ts
npx tsx --test --test-name-pattern="inactive mentor" tests/requestService.test.ts
```

CONTRIBUTING.md asks for both `npm run check` and `npm run build` before a pull request.

Runtime configuration is environment-only (`src/config.ts`): `PORT` (default 3000) and
`STUDYBRIDGE_DATA_FILE` (default `var/studybridge.json`). To exercise the HTTP layer against
throwaway data without touching your local file:

```bash
npm run build:server && STUDYBRIDGE_DATA_FILE=/tmp/sb.json PORT=3100 node dist/server.js
```

`.claude/launch.json` defines a `studybridge-dev` preview configuration (`npm run dev`,
port 3000) for browser checks. Demo logins are in README.md: `student`, `mentor`,
`coordinator`, each with the username as password.

### Known test-suite state

`tests/config.test.ts` > "uses local defaults" fails on Windows because it asserts POSIX
paths (`/project/var/studybridge.json`) against `path.resolve`. Expect 45 of 46 passing on
Windows. That failure is pre-existing and is not a regression.

## Where the docs are

The docs are the source of truth and several rules are deliberately inconvenient. Read the
relevant one before changing behavior.

| Doc | What it settles |
| --- | --- |
| `docs/product-rules.md` | The user promises: roles, request lifecycle, limits, note privacy, audit events, account closure. Check here first for any behavior change. |
| `docs/architecture.md` | Layers, the mutation sequence every service follows, dependency direction. |
| `docs/testing.md` | Where a regression test belongs and what it must assert. |
| `docs/deployment.md` | Container contract: pure-JS deps only, `PORT`, `STUDYBRIDGE_DATA_FILE`, `GET /api/health` must not touch the data file, keep the SIGTERM handler in `src/server.ts`. |
| `docs/adr/0001-service-boundaries.md` | Why every mutation, even a one-liner, goes through a service. |
| `docs/adr/0002-retain-anonymized-history.md` | Why accounts are anonymized in place and never deleted or reassigned. |
| `docs/ui-copy.md` | Wording: "support request" not "ticket", "claim", "staff note", sentence-case buttons, "StudyBridge" is one word. |
| `docs/demo-script.md`, `docs/roadmap.md` | Presentation guidance and ideas only. Neither defines product behavior; do not implement roadmap items without a work item. |
| `README.md`, `CONTRIBUTING.md`, `SECURITY.md` | Quick start and repo map; change and PR conventions; fictional-data-only reminder. |

## Architecture

```text
browser -> session cookie -> HTTP route -> service -> repository -> JSON file
                                   |          |-> audit event
                                   |          '-> policy functions (src/domain/policies.ts)
```

**Composition root.** `src/server.ts` reads config, lazily builds the `Application` from
`src/application.ts` (JSON repository, `AuthService`, `AccountService`, `RequestService`,
`QueryService`, wired with `SystemClock` and `RandomIdSource`), sends `/api/*` to the router
and serves `public/` statically for everything else.

**HTTP layer (`src/api/`).** `router.ts` is one handler with regex path matching.
`/api/health`, login, logout, and session lookup are unauthenticated; every other route first
resolves the actor from the `studybridge_session` cookie via `AuthService.accountForToken`.
Routes parse transport input, call exactly one service method, and never write to a
repository or accept an actor/viewer ID from the client (the account-close route returns 400
if the body names one). `http.ts` maps `AppError` codes to statuses: `bad_request` 400,
`unauthorized` 401, `forbidden` 403, `not_found` 404, `conflict` 409; anything else is a
logged 500.

**Auth (`src/auth/`).** Three hard-coded demo credentials map to seed account IDs
(`acct_steve`, `acct_morgan`, `acct_priya`). Sessions live in an in-memory `Map` with an
eight-hour expiry, so restarting the server signs everyone out. `accountForToken` reloads the
account and rejects inactive ones on every request, so an inactive account can never reach a
service over HTTP. Service-layer checks for inactive actors are still required (defense in
depth) and are verified by tests, not by browser checks.

**Services (`src/services/`).** Each mutation follows the same sequence: load actor and target
(`requireAccount` / `requireRequest` in `helpers.ts`), authorize with a policy, build a new
record without mutating the old one, persist, then append an audit event. Keep persist and
audit visibly adjacent and never drop the audit event. Documented idempotent no-ops
(re-claiming your own request, re-anonymizing) return early and write nothing, but authorize
first: an unauthorized actor gets `forbidden`, not a silent no-op. `QueryService` composes
view models and is the last server-side defense against leaking staff notes; `visibleNoteCount`
and note lists must be filtered with `canViewNote` for the viewer.

**Domain (`src/domain/`).** `types.ts` holds records, view models, and the
`AuditEvent.action` string union (extend it when adding a use case). `errors.ts` has
`AppError` plus `badRequest` / `unauthorized` / `forbidden` / `notFound` / `conflict`
factories. `policies.ts` is pure `can*` functions over `Account` and `HelpRequest`; every one
requires `actor.active`. The domain imports nothing from other layers.

**Repositories (`src/repositories/`).** `StudyBridgeRepository` is the storage boundary.
`InMemoryRepository` backs tests; `JsonFileRepository` extends it and, after every mutation,
serializes the whole state to a temp file and renames it into place. Each repository call
commits immediately (no transactions). Both return copies; mutating a returned object changes
nothing.

**Data at runtime.** `data/seed.json` is immutable input. On first start it is copied to
`var/studybridge.json` (gitignored) and all writes go there; `npm run reset:data` deletes it.
Never edit the seed to make a test pass, and never let tests touch `var/`. Production sets
`STUDYBRIDGE_DATA_FILE=/data/studybridge.json`.

**Client (`client/`).** Framework-free TypeScript compiled by `tsconfig.client.json` into
`public/assets/` (gitignored). `app.ts` owns state and rendering, `api.ts` wraps `fetch`,
`dom.ts` has element helpers; `public/index.html` and `styles.css` are hand-written. The
client never sees the session token and is not a security boundary: hiding a button is UX,
the service still authorizes. Do not add client-side limits that differ from the server's
(a `maxLength` counting UTF-16 units once contradicted the server's code-point rule).

**Dependency direction.** domain <- repositories <- auth, services <- api <- `server.ts`.
Do not add interfaces for stateless helpers or split files just to add layers.

**TypeScript settings that bite.** Server code is NodeNext ESM: relative imports need the
`.js` extension. Both configs use `strict`, `noUncheckedIndexedAccess` (indexing yields
`T | undefined`) and `exactOptionalPropertyTypes` (omit an optional property rather than
assigning `undefined`; see the spread pattern in `parseFilters`).

## Testing conventions

- Tests use Node's built-in runner (`describe` / `it` from `node:test`, `assert` from
  `node:assert/strict`) executed through `tsx`; there is no compile step.
- **Every bug fix needs a service-layer regression test.** A policy test is a welcome
  extra; a route-only test does not count.
- Start each test from `createTestContext()` in `tests/fixtures.ts`: a fresh
  `InMemoryRepository` built from `baseState()`, a `FixedClock` at `NOW`
  (`2026-02-14T18:30:00.000Z`), and a `SequenceIdSource("suite")` with one counter shared
  by every prefix, so creating a request yields `request_suite_1` and its audit event
  `event_suite_2`.
- Fixture IDs differ from seed IDs. Fixtures: `student_steve`, `student_lee`,
  `mentor_morgan`, `mentor_inactive`, `coordinator_priya`; requests `request_calculus`
  (open), `request_planning` (claimed by Morgan, one public and one staff note),
  `request_writing` (open), `request_resolved`, `request_inactive_claim` (claimed by the
  inactive mentor).
- Assert the user-visible result, the audit side effect (action, target, non-sensitive
  `details`), and the non-effects of rejected or idempotent actions (state deep-equals its
  prior value, `listAuditEvents()` is `[]`). Check that `JSON.stringify(events)` contains no
  names, emails, or note bodies. No snapshots.
- Rejections are asserted by `AppError.code`; `tests/requestService.test.ts` has a local
  `assertAppError(action, code)` helper for this.
- To prove a regression test bites, stash the fix and re-run only that test:
  `git stash push -- src/services/<file>.ts`, run it, then `git stash pop`.
- After automated checks, repeat the scenario manually as the affected role and inspect the
  HTTP response, not just the UI. Browser checks write to `var/studybridge.json`; run
  `npm run reset:data` afterwards.

## Conventions and gotchas

- No new runtime dependencies. The deployment container has no compiler and no network, so
  anything added must be pure JS and justified against `docs/deployment.md`.
- Audit `details` never contain PII (names, emails, note bodies, descriptions). Audit events
  are append-only.
- Account closure is anonymization: `displayName` becomes "Former member", `email` becomes
  `closed+<id>@invalid.studybridge`, `active` is false, `anonymizedAt` is set, the ID is kept
  and related records are untouched. Two entry points: coordinator
  `POST /api/accounts/:id/anonymize` (`account.anonymized`) and student self-service
  `POST /api/accounts/:id/close` (`account.closed`, which also ends the session).
- Tags keep their display spelling; matching uses `tagKey()` from `src/services/helpers.ts`.
  Note length is 500 Unicode code points (`[...body].length`); title, description, and tag
  limits still count with `.length`.
- `.gitattributes` sets `* text=auto`. On Windows the working tree is CRLF while the index is
  LF, so script-based edits should match on normalized text and preserve the file's existing
  line endings to keep diffs clean.
- Fictional data only, everywhere: fixtures, examples, commit messages, screenshots.
