# CLAUDE.md

StudyBridge is a peer tutoring / student-support app.

## Commands

For running and testing the app, use the following npm scripts:

```bash
npm run check      # typecheck + test
npm test           # run tests
npm run typecheck  # typecheck only
npm run build      # clean, then compile
npm run dev        # build client, then continuously watch src/server.ts
npm start          # build, then run dist/server.js
```

## Docs

The documentation for this project is located in `docs/`. It includes information about deployment, architecture, and testing conventions.

## Testing conventions

ALl tests live in `tests/`. Every bug fix or new feature should have accompanying tests.

- Verify the test actually reproduces the bug: it should **fail before** the fix
  and **pass after**.
- Reuse existing harnesses and fixtures where possible to prevent code duplication.

## Working in this repo

Search `docs/` for rules governing the behavior before changing it, and
reproduce a bug before fixing it.
