# GitWhisper launch posts

Copy-paste ready posts for X, Hacker News and Reddit. Attach `docs/demo.gif` where noted.

**GIF URL:** https://raw.githubusercontent.com/priyanshkk/gitwhisper/main/docs/demo.gif  
**Repo:** https://github.com/priyanshkk/gitwhisper  
**Alt text:** Terminal demo of GitWhisper reviewing a sample diff, showing a masked Stripe key finding, a 74/100 review score and three changed files.

---

## X / Twitter thread

### Post 1 — attach `docs/demo.gif`

> Meet GitWhisper — a CLI that reviews your staged diff, catches leaked secrets, writes clean Conventional Commits and generates PR descriptions with Mermaid diagrams.
>
> No API key needed to try it:
>
> `npx gitwhisper review --demo`
>
> ~5s, offline, no repo setup. 🧵

Alt text: Terminal demo of GitWhisper reviewing a sample diff, showing a masked Stripe key finding, a 74/100 review score and three changed files.

### Post 2

> The demo is deterministic: 1 critical + 1 medium secret finding, review score 74/100, 3 files / 30 additions. It shows exactly what a real `gw review` does before you push.

### Post 3

> Security guard uses 10 curated rules + Shannon entropy. It catches AWS, GitHub, OpenAI, Stripe, private keys and JWTs — and masks every finding. Code and keys stay local by default.

### Post 4

> `gw commit` drafts scoped Conventional Commits from the staged diff. `gw pr` writes title, changelog, testing notes, risks and a Mermaid impact diagram. One tool, three pre-push jobs.

### Post 5

> BYOK for Gemini / OpenAI / Anthropic, or go 100% offline with local Ollama or deterministic heuristics. Native fetch, ESM TypeScript, no telemetry, localhost-only dashboard.

### Post 6

> Built with TypeScript, Commander, Clack, Picocolors, Simple-Git, Vitest, Biome, Husky and GitHub Actions. 21 tests + green CI.
>
> Repo + GIF: https://github.com/priyanshkk/gitwhisper
>
> Stars/RTs help a lot. 🙏

---

## Hacker News — Show HN

**Title**

```text
Show HN: GitWhisper – local-first CLI that reviews diffs, guards secrets and writes PRs
```

**Comment**

```text
Hi HN,

I built GitWhisper because I kept doing the same three things badly before every push: skim my own diff, miss obvious secrets, and write vague commit messages.

It's a Node 20+ CLI that:

- scans staged diffs with 10 secret rules plus Shannon entropy
- scores the diff and gives actionable review notes
- drafts Conventional Commits from the staged diff
- generates PR bodies with changelog, testing notes, risks and a Mermaid impact diagram
- runs fully offline via deterministic heuristics or local Ollama, with optional BYOK for Gemini, OpenAI and Anthropic

Fastest way to see it, with no repo and no API key:

  npx gitwhisper review --demo

The demo uses a deterministic offline engine, runs in about five seconds, and returns 1 critical + 1 medium finding, a 74/100 review score, and 3 files / 30 additions. Nothing is written to disk.

GIF: https://raw.githubusercontent.com/priyanshkk/gitwhisper/main/docs/demo.gif
Repo: https://github.com/priyanshkk/gitwhisper

It's MIT licensed, has 21 tests and green GitHub Actions. Feedback on the secret rules, false-positive handling and CLI output would be especially welcome.
```

---

## Reddit — r/opensource

**Title**

```text
GitWhisper: local-first CLI that catches secrets, reviews diffs and writes commits + PRs (MIT, TypeScript)
```

**Body**

```text
I built GitWhisper to handle the boring pre-push checks in one command line tool.

What it does:
- Local secret guard: 10 curated rules + Shannon entropy for AWS, GitHub, OpenAI, Stripe, private keys and JWTs; findings are masked
- Review: score, concrete suggestions and diff stats from your staged changes
- Commit: scoped Conventional Commit messages with body and confidence
- PR: title, changelog, testing notes, risks and a Mermaid impact diagram
- Privacy: local heuristics or local Ollama by default; optional Gemini/OpenAI/Anthropic with your own key; no telemetry

Try it without a repo or API key:

  npx gitwhisper review --demo

The demo is deterministic, takes about 5 seconds and shows 1 critical + 1 medium secret finding, 74/100 review score and 3 files / 30 additions.

Demo GIF: https://raw.githubusercontent.com/priyanshkk/gitwhisper/main/docs/demo.gif
Repo: https://github.com/priyanshkk/gitwhisper

Stack: TypeScript, Node 20+, Commander, Clack, Picocolors, Simple-Git, Vitest, Biome, Husky and GitHub Actions. MIT licensed. I'd love feedback on the secret rules and on what you'd want from a real diff review.
```

---

## Reddit — r/commandline

**Title**

```text
npx gitwhisper review --demo — 5-second offline demo for secret scanning + diff review + commit/PR writing
```

**Body**

```text
I made a CLI that does three things before you push: scans the staged diff for secrets, reviews it, and drafts the commit/PR text.

Zero-setup demo:

  npx gitwhisper review --demo

No repo, no API key, no files touched. Output is deterministic: 1 critical + 1 medium secret finding, 74/100 review score, 3 files / 30 additions, offline engine.

Real use:

  git add .
  npx gitwhisper review
  npx gitwhisper commit
  npx gitwhisper pr
  npx gitwhisper dashboard --demo

There's also a short alias after install: `gw review`, `gw commit`, `gw pr`.

It works fully offline via heuristics or local Ollama, with optional Gemini/OpenAI/Anthropic keys if you want model-backed writing.

GIF: https://raw.githubusercontent.com/priyanshkk/gitwhisper/main/docs/demo.gif
Repo: https://github.com/priyanshkk/gitwhisper
```

---

## Posting notes

- X: attach `docs/demo.gif` to post 1 and set the alt text above.
- HN: keep the title exactly in `Show HN: …` form and stay in the thread for questions.
- Reddit: post r/opensource and r/commandline at different times, and reply to comments with concrete examples rather than reposting the same text.
- Do not paste real keys or private repo snippets into comments; use the deterministic demo instead.
