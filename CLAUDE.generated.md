# StudyBridge — working notes

A teaching project: a peer tutoring and student-support app. Plain TypeScript
ESM on Node's standard library — no framework and no runtime dependencies.

Read these first; this file only records what they don't say.

| Document | What it settles |
| --- | --- |
| `README.md` | Tour, demo accounts, repository map |
| `docs/product-rules.md` | **The spec.** Roles, closure and retention, requests, notes and privacy, audit events |
| `docs/architecture.md` | Layer boundaries and dependency direction |
| `docs/testing.md` | Where a test belongs and what it must assert |
| `CONTRIBUTING.md` | Change conventions and PR expectations |
| `docs/adr/0001-service-boundaries.md` | Why routes must not write through repositories |
| `docs/adr/0002-retain-anonymized-history.md` | Why closure anonymizes rather than deletes |

When behavior is ambiguous, `docs/product-rules.md` decides it. Quote the
relevant line when explaining a fix.

## Commands

```bash
npm run check      # typecheck + test — the gate before any commit
npm test           # tsx --test tests/*.test.ts
npm run typecheck  # server and browser projects
npm run build      # clean, then compile both projects
npm run dev        # build client, then tsx watch src/server.ts
npm run reset:data # restore var/studybridge.json from data/seed.json
```

### None of those run on this machine

Node and npm are not on `PATH`, and `node_modules/` has never been installed —
so `tsx` is unavailable and **every `npm` script above is currently
unrunnable**. `npm run typecheck` and `npm run build` have therefore *not* been
run against any change so far. Say so when reporting work, and re-run them as
soon as a real toolchain is available.

Tests can still be run through the Node that ships inside Adobe Creative Cloud
(v22.17.1) plus a two-file loader shim, because Node can strip TypeScript types
natively. `--experimental-transform-types` is required, not optional: plain
type-stripping rejects the parameter properties used in the service
constructors.

```bash
"/c/Program Files/Adobe/Adobe Creative Cloud Experience/libs/node.exe" \
  --experimental-transform-types \
  --import "file:///<abs-path>/register.mjs" \
  --test tests/*.test.ts
```

The shim lives in the session scratchpad (it must not be committed) and is
recreated in a few seconds. `register.mjs`:

```js
import { register } from "node:module";
register("./ts-resolve.mjs", import.meta.url);
```

`ts-resolve.mjs` exports a `resolve` hook that rewrites a relative `./x.js`
specifier to `./x.ts` when that file exists, and otherwise defers to
`nextResolve`. This is needed because the sources use `.js` import specifiers
that resolve to `.ts` files.

## Known failing test

`tests/config.test.ts:9` fails on a clean tree on Windows: it asserts
`config.dataFilename === "/project/var/studybridge.json"`, but `path.join`
produces backslashes here. **51 tests, 50 pass, 1 fail** is the expected clean
baseline — it is not a regression from any recent change.

## Rules that actually bite

- **Routes never write through a repository.** A mutation goes through a
  service, because services apply authorization, product rules, and the audit
  event as one use case.
- **The session cookie is the only trusted source of the acting account.** Never
  accept an actor or viewer ID from the browser. Where a documented request
  shape includes `actorId` (the account-close route), verify it matches the
  session and reject a mismatch — check it, don't obey it.
- **Authorization policies are pure and live in `src/domain/policies.ts`.** Keep
  them about *actor eligibility*. Resource state — already assigned, already
  resolved — belongs in the service, which can return the right distinction
  (a `conflict` rather than a `forbidden`). Issue #5 turned on exactly this.
- **Never mutate a record in place.** Build the new object, persist it, then
  append the audit event immediately adjacent.
- **The query service is the last line of defense for staff-only notes** —
  including their *count*, not just their content.
- `data/seed.json` is immutable input. Tests must never touch
  `var/studybridge.json`; use `createTestContext()` from `tests/fixtures.ts`.

## Testing discipline

Every bug fix needs a **service-layer** regression test; a route-only or
policy-only test does not substitute for it. Assert the visible result, the
audit event, and — for rejected or idempotent actions — the important
*non*-effects (nothing written, no audit event appended).

Prove the test is a regression test rather than a guard. Hold the test file
constant and swap the sources back to the previous commit:

```bash
git show <rev>:src/path.ts > src/path.ts   # run suite, expect fail
git checkout -- src/path.ts                # run suite, expect pass
```

Label each new test in the write-up: **regression** (fail → pass) or **guard**
(pass → pass, pinning that the fix opened no new hole). Both are worth having;
conflating them overstates the evidence.

## How we work here

Sam names a GitHub issue number; the flow is: fetch the issue, explain what
needs to change and why, make the edits, then report. **Sam commits** — don't
commit unless asked.

The `gh` CLI is not installed; fetch issues from
`https://github.com/nritschel/studybridge/issues/N` instead.

A report should cover: root cause, the product rule that applies, the
before/after test matrix with each test labeled, the suite result against the
50/51 baseline, and anything deliberately left untouched.

## Status

Issues #1–#5 are fixed and committed on `sam-bradley-homework-3`
(`9882ea9`, `c3185cb`, `ce8646e`, `efadd18`, `136c832`).

Open follow-ups, offered but never decided:

- Rename `counts staff notes in list summaries for staff` in
  `tests/queryService.test.ts` to make its guard role explicit.
- Strengthen the issue-#1 tests: a `tag: "planning"` case expecting both
  `request_planning` and `request_inactive_claim`, plus a negative case
  (`tag: "calc"` → `[]`) to pin exact-match rather than substring semantics.
- `npm run typecheck` and `npm run build`, once a toolchain exists.
- Deliberately untouched: the N+1 `listNotesForRequest` call per request in
  `QueryService.listRequests`; the `title`/`description`/`tag` length checks
  still count UTF-16 code units, while note bodies count code points.
