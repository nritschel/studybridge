# CLAUDE-BY-CLAUDE.md

Working notes for StudyBridge, a small peer tutoring and student-support app.
Students create requests for help, mentors claim them, and coordinators add
private staff notes. This is a teaching project, not a hosted service.

Most behavior that looks like a bug is written down somewhere in `docs/`. Check
there before changing it.

## Commands

```bash
npm install
npm run dev          # builds the client, then tsx watch on src/server.ts -> http://localhost:3000
npm run check        # typecheck (server + client), then tests
npm test             # tsx --test tests/*.test.ts
npm run typecheck
npm run build        # clean, then tsc for both tsconfigs
npm run reset:data   # deletes var/studybridge.json; it is recreated from data/seed.json on next start
```

`npm run check` and `npm run build` are the pre-pull-request gate named in
CONTRIBUTING.md. Node 20 or newer (`.nvmrc`). Demo logins are `student`,
`mentor`, and `coordinator`, each using the username as its password.

There is no linter and no formatter. Match the surrounding style, including the
comment voice: comments explain why a rule exists, not what a line does.

## Where the docs are

| File | What it settles |
| --- | --- |
| `docs/product-rules.md` | Role capabilities, note visibility, account closure. The user-facing promises. |
| `docs/architecture.md` | Layering, dependency direction, what a route may and may not do. |
| `docs/testing.md` | Where a regression test belongs and what it must assert. |
| `docs/adr/0001-service-boundaries.md` | Why every mutation goes through a service. |
| `docs/adr/0002-retain-anonymized-history.md` | Why closing an account anonymizes instead of deleting. |
| `docs/deployment.md` | Container constraints: read-only image, no network, no compiler, `/data` volume. |
| `docs/ui-copy.md` | Wording rules ("support request", "claim", "staff note"). |
| `docs/demo-script.md` | Presentation guidance only, not acceptance criteria. |
| `docs/roadmap.md` | Ideas, explicitly not current behavior. Do not implement from it. |
| `CONTRIBUTING.md` | Change conventions and the PR description checklist. |

## Layout

```text
client/           Browser UI, plain TypeScript, no framework
public/           index.html and styles.css; public/assets/ is build output (gitignored)
data/seed.json    Read-only seed data
var/              Runtime working data (gitignored)
src/domain/       Types, errors, pure policy functions. Imports nothing from other layers.
src/repositories/ Storage interfaces plus JSON-file and in-memory implementations
src/auth/         Demo credentials and in-memory sessions
src/services/     Use cases: authorization, product rules, and the audit event as one unit
src/api/          HTTP parsing, routing, response helpers
src/server.ts     Composition root; may import every layer
tests/            Service and policy tests
```

Dependencies point inward. The production server uses only Node's standard
library; TypeScript and `tsx` are dev dependencies. Adding a runtime dependency
needs a reason the deployment notes allow.

The project is ESM, so relative imports carry a `.js` extension even though the
sources are `.ts`.

## Runtime data and sessions

On first start the server copies `data/seed.json` to `var/studybridge.json`.
Override the destination with `STUDYBRIDGE_DATA_FILE`; the container sets it to
`/data/studybridge.json`. Every later write goes to that working file only, and
`data/seed.json` is immutable input. The JSON repository commits on each call
and returns copies of records, so mutating a returned object does not change
storage.

Sessions live in memory in `AuthService` and expire after eight hours, so a
restart signs everyone out. The token travels in an HTTP-only cookie and client
code never reads it. `AuthService` rejects inactive accounts both at login and
on every session lookup. `GET /api/health` answers without touching the data
file.

## Rules that are easy to break

- Routes parse and translate; they never write through a repository. Even a
  one-field update gets a service method (ADR 0001).
- Routes resolve the acting account from the session cookie. An actor or viewer
  ID supplied by the browser is ignored, not honored: account IDs appear in
  request payloads, so trusting one is an authorization hole.
- A mutation persists the record and appends an audit event, kept adjacent in
  the service. Audit events are append-only and never carry note bodies, names,
  or emails.
- `QueryService` is the last server-side defense against exposing staff notes.
  A summary count must not reveal that a staff note exists.
- Closing an account anonymizes it in place and keeps the account ID. Related
  requests, notes, and audit events stay put and render an anonymized label
  (ADR 0002).
- Text limits count Unicode code points (`[...body].length`), not UTF-16 code
  units. The browser's `maxLength` counts code units and is a deliberately
  looser soft cap.
- The client is not an authorization boundary. Hiding a button is a usability
  choice; the service must still refuse the operation.

## Testing conventions

Tests run on Node's built-in test runner through `tsx`, so TypeScript test files
execute without a separate build.

Every bug fix needs a service-layer regression test. A route-only or policy-only
test is not a substitute, though an additional policy test is welcome. Each test
starts from `createTestContext()` in `tests/fixtures.ts`, which builds a fresh
`InMemoryRepository` plus the fixed clock and sequence ID source. Tests must
never read or write `var/studybridge.json`, and fixtures stay fictional.

Assert the user-visible result, the important side effects such as the audit
event, and the important non-effects, especially for rejected and idempotent
actions. No snapshots; explicit assertions.

Reproduce a bug before fixing it. After the automated checks pass, walk the
scenario in the browser as the affected role and inspect the response, not just
whether the UI hid a control.
