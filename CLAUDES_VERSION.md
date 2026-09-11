# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

StudyBridge is a small peer-tutoring app (teaching project). Students create help requests, mentors claim and resolve them, staff add public or staff-only notes, and coordinators can anonymize accounts. Node 20+, TypeScript, **zero runtime dependencies** (Node standard library only; `tsx` and `typescript` are dev-only). Do not add production dependencies without checking `docs/deployment.md` — the target container has no compiler, no network, and a read-only image, so native modules (e.g. SQLite bindings) are out.

## Commands

```bash
npm run dev          # build client, then tsx watch src/server.ts on :3000
npm test             # all tests (Node test runner via tsx)
npx tsx --test tests/requestService.test.ts                       # one file
npx tsx --test --test-name-pattern="claim" tests/requestService.test.ts  # one test by name
npm run typecheck    # tsc --noEmit for both server and client projects
npm run check        # typecheck + test — run before opening a PR
npm run build        # clean, then emit dist/ (server) and public/assets/ (client)
npm run reset:data   # delete var/studybridge.json so seed data is re-copied on next start
```

Demo logins: `student`/`student`, `mentor`/`mentor`, `coordinator`/`coordinator`.

Two tsconfigs: `tsconfig.json` (server, `src/` → `dist/`, NodeNext) and `tsconfig.client.json` (browser, `client/` → `public/assets/`, DOM lib). Both use `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`, so spread-with-conditional (`...(x === null ? {} : { x })`) is the idiom for optional fields. Server imports use `.js` extensions.

## Architecture

Layered, with dependencies pointing inward (see `docs/architecture.md`, ADR 0001):

```
browser (client/) -> session cookie -> src/api/router.ts -> src/services/* -> src/repositories/* -> var/studybridge.json
                                                             |-> src/domain/policies.ts
                                                             |-> audit event
```

- **`src/server.ts`** is the composition root: reads `src/config.ts` (env `PORT`, `STUDYBRIDGE_DATA_FILE`), lazily builds the `Application` from `src/application.ts`, serves `/api/*` via the router and everything else as static files from `public/`. Keep the SIGTERM handler; the deploy platform relies on it.
- **`src/api/`** — a single hand-rolled router (`router.ts`) with regex path matching; no framework. Routes parse transport input, resolve the actor from the session cookie, call exactly one service method, and let `sendError` in `http.ts` map `AppError.code` to an HTTP status. **Routes must never call the repository directly**, even for one-field updates. Only health, login, logout, and session lookup skip authentication. The browser never supplies an actor/viewer ID; the `actorId` in the account-close body is an intent confirmation that must equal the session account.
- **`src/services/`** — `RequestService` and `AccountService` own mutations; `QueryService` composes read-only view models and is the last line of defense against leaking staff notes to students. Every mutation follows: load actor + target → authorize (policy function) and check state → build a new record (never mutate the loaded one) → `save*` → `appendAuditEvent`. Keep save and audit adjacent; the JSON repo has no transactions. Documented idempotent no-ops (re-claiming your own request, re-anonymizing) return early **without** an audit event, but authorization still runs first.
- **`src/domain/`** — types, `AppError` with codes `bad_request|unauthorized|forbidden|not_found|conflict`, and pure policy predicates (`canClaimRequest`, `canViewNote`, …). Imports nothing from other layers.
- **`src/repositories/`** — `StudyBridgeRepository` interface; `JsonFileRepository` (prod, copies `data/seed.json` to the working file on first open, commits every call, returns copies) and `InMemoryRepository` (tests).
- **`src/auth/`** — demo credentials mapped to seed account IDs; sessions live in a `Map` in `AuthService` and expire after 8h. A restart signs everyone out (accepted).
- **`client/`** — framework-free TypeScript; `app.ts` renders and calls `api.ts`. The client is not a security boundary and must not encode product rules the server doesn't enforce.

## Product rules that shape code

`docs/product-rules.md` is the source of truth; the ones most often relevant:

- Requests: `open -> claimed -> resolved`. Title ≤120, description ≤1200, ≤5 distinct tags (case-insensitive dedupe, original spelling kept) of ≤30 chars. Note bodies ≤500 **Unicode code points**, not UTF-16 units.
- Students must not learn the content **or the count** of staff notes anywhere (detail, list summaries, errors, client state).
- Account closure = anonymize in place (ADR 0002). Keep the ID, replace name/email with placeholders, set inactive, never cascade-delete or reassign records, never put the old name/email in audit details. UI shows "Former member".
- Audit events are append-only and carry IDs plus small non-sensitive details — never note bodies, descriptions, names, or emails.
- `docs/roadmap.md` is ideas only; don't implement items from it without a work item.

## Testing conventions

- Every bug fix needs a **service-layer** regression test in `tests/*.test.ts`; a route-only or policy-only test does not substitute (policy tests are welcome in addition).
- Use `createTestContext()` from `tests/fixtures.ts`: fresh `InMemoryRepository`, `FixedClock` at `NOW`, `SequenceIdSource("suite")` for deterministic IDs. Never touch `var/studybridge.json` from tests; never edit `data/seed.json` to make a test pass.
- Assert the returned value, the audit event (or its absence for no-ops/rejections), and non-effects on other records. No snapshots.
