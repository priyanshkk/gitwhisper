# Contributing to GitWhisper

Thanks for helping make commits cleaner and repositories safer. GitWhisper is local-first, so contributions should keep that promise intact.

## Quick setup

```bash
git clone https://github.com/priyanshkk/gitwhisper.git
cd gitwhisper
npm install
npm run build
npm run demo
```

You need Node.js 20 or newer. npm workspaces install the CLI and the React dashboard together.

## Development loop

```bash
npm run dev            # watch TypeScript
npm run build:web      # rebuild the dashboard
npm run typecheck
npm run lint
npm test
```

Run the dashboard locally with:

```bash
npm run build
node dist/cli/index.js dashboard --demo
```

Then open <http://localhost:4321>.

## Repository conventions

- Use Conventional Commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.
- Keep relative ESM imports with a `.js` extension, e.g. `import { parseDiff } from './git.js'`.
- Add tests for any scanner rule, parser behaviour or heuristic change.
- Never commit real keys, tokens, customer data or redacted-looking sample secrets that could be mistaken for live values.
- Prefer deterministic offline behaviour for demo paths.

## Adding a secret rule

1. Add a `Rule` to `RULES` in `src/core/scanner.ts`.
2. Include a specific remediation in `recommendation`.
3. Add a positive test and a placeholder-ignore test in `tests/scanner.test.ts`.
4. Confirm redaction hides at least the middle of the value.

## Adding an LLM provider

1. Add a case to `createProvider` in `src/core/llm/provider.ts`.
2. Use native `fetch`, a timeout and strict JSON parsing.
3. Add a system prompt in `src/core/llm/prompts.ts` if the task is new.
4. Ensure failures fall back to offline heuristics instead of crashing.

## Pull request checklist

- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] `npm run demo` produces the expected output
- [ ] Docs updated for user-visible changes

## Code of conduct

Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md). Be respectful, assume good intent and keep feedback specific.

## Security issues

Do not open a public issue for a security vulnerability. Follow [SECURITY.md](SECURITY.md) instead.
