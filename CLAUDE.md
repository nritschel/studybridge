StudyBridge, small peer tutoring app. teaching project. students file requests,
mentors claim them, coordinators add staff-only notes.

node 20+, npm install, npm run dev for localhost:3000. npm run check is
typecheck + tests, npm run build before a PR. npm run reset:data wipes
var/studybridge.json which reseeds from data/seed.json on next start. logins
are student/student, mentor/mentor, coordinator/coordinator.

typescript esm, so relative imports end in .js even though files are .ts.
no production deps at all, server is node stdlib only.

layers go domain -> repositories -> services -> api -> server.ts as the
composition root. domain is pure types, errors and policy functions. services
own the whole use case, authz + rules + audit event. api just parses and routes.

adr/0001: every mutation goes through a service, routes never write to a
repository directly. adr/0002: closing an account anonymizes it in place and
keeps the account id, it never deletes.

auth is an http-only session cookie. inactive accounts get rejected at login
and on every session lookup.

audit events are append only and must never contain note bodies, names or
emails.

careful with string lengths, the limits are unicode code points ([...s].length)
not utf-16 code units (s.length). the html maxLength attr counts code units.

tests use node's built-in runner through tsx, so npm test runs the .ts files
directly. bug fixes need a service-level regression test.

docs/ has the rest. product-rules.md for actual behavior, architecture.md for
the layering, testing.md for test rules.
