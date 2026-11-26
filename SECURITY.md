# Security Policy

## Supported versions

GitWhisper is a young project. Security fixes target the latest released version.

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |
| < 0.1 | No |

## Reporting a vulnerability

Please do **not** open a public issue for a security vulnerability.

1. Open a private report using GitHub's **Security → Report a vulnerability** flow on this repository.
2. Include the affected version, Node.js version, reproduction steps and impact.
3. Redact all keys, tokens and customer data from examples.
4. You should receive an acknowledgement within 72 hours.

## What counts as in scope

- Secret scanner bypasses for well-known credential formats
- Accidental transmission of an API key to a third party
- Path traversal through the local dashboard's static file server
- Command injection in CLI or dashboard code
- Unsafe persistence of provider credentials

## What is out of scope

- Social engineering
- Issues that require the attacker to already have local code execution
- Vulnerabilities in third-party model providers
- Reports without a reproducible example

## Security design

- The dashboard binds to `127.0.0.1` only.
- Keys are stored in `~/.gitwhisper/config.json` with `0o600` where supported.
- Scanner findings are redacted before being printed, saved or sent to a model.
- The local scanner's risk score cannot be raised by an LLM response.
- `--demo` never reads configuration, contacts a provider or writes artifacts.

## Safe demo key

The demo uses a clearly documented fake Stripe-style value to exercise the scanner. It is not a real credential and must never be used for authentication.
