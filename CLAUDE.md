. Key Technical Concepts:
   - Node 20 + TypeScript ESM project, no runtime deps; `npm run check` = `tsc --noEmit` (server + client tsconfigs) + `tsx --test tests/*.test.ts` (Node built-in test runner).
   - Layered server: `src/api/router.ts` (hand-rolled HTTP routing) → services (`QueryService`, `RequestService`, `AccountService`, `AuthService`) → `src/domain/policies.ts` (pure authorization functions) → repository (in-memory / JSON file at `var/studybridge.json`, configurable via `STUDYBRIDGE_DATA_FILE`, `PORT` default 3000).
   - Vanilla TS browser client in `client/` compiled to gitignored `public/assets/`; filtering is server-side via query params.
   - Fixture IDs: `student_steve`, `student_lee`, `mentor_morgan`, `mentor_inactive`, `coordinator_priya`; requests `request_calculus`, `request_planning`, `request_writing`, `request_resolved`, `request_inactive_claim`; notes `note_public`, `note_staff`. Seed data (`data/seed.json`) uses different IDs: `acct_steve`, `acct_morgan`, `acct_priya`, `acct_former`.
   - Code point counting via string iteration; `toLocaleLowerCase()` for case folding (consistent with existing `normalizedTags`).
   - Session cookie `studybridge_session`; `AuthService.accountForToken` rejects inactive accounts.
   - IDE diagnostics about `node:*` types and `'error' is of type 'unknown'` are pre-existing IDE config noise, not real errors; `npm run check` is the source of truth.
   - The main README (`README.md`) is found in the root directory, as well as the code of conduct (`CODE_OF_CONDUCT.MD`) and the contributing guide (`CONTRIBUTING.MD`). All other documentation is found in the docs folder in the root directory, including:
     - Product rules (`docs/product-rules.md`) are authoritative: case-insensitive tag matching; students must never learn staff-note count; 500 Unicode code point note limit; account closure = in-place anonymization (ADR 0002), idempotent, audit events never contain PII; "API requests must not choose their own actor or viewer ID"; "Only a coordinator may anonymize a different account."
     - Testing guide (`docs/testing.md`): bug fixes need service-layer regression tests using `createTestContext()` from `tests/fixtures.ts`; tests must not touch `var/studybridge.json`; no real PII in fixtures.
     - Architecture (`docs/architecture.md`): `client/app.ts` renders server data and sends user actions over HTTP; Login sets an HTTP-only session cookie, so client code never reads or stores the session token;
   - The repository map: 
        client/       Browser UI, written in TypeScript without a framework
        data/         Read-only seed data copied on first start
        docs/         Architecture, product, testing, and project notes
        public/       HTML and CSS served by the application
        src/api/      HTTP parsing, routing, and response helpers
        src/auth/     Demo credential validation and in-memory login sessions
        src/domain/   Shared data types, errors, and authorization policies
        src/services/ Use cases and application rules
        src/repositories/ Persistence interfaces and JSON-file implementation
        tests/        Service and policy tests