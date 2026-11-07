# Devpost submission copy

**Project name (60 chars):** AgentPurse: spend authority for AI agents

**Elevator pitch:** Give your AI a budget, not your bank login. A policy engine decides what agents and invoices may pay; PayPal moves the money.

**Built with:** Next.js, TypeScript, PostgreSQL, PayPal Payouts + Webhooks (sandbox), Google Gemini API (or Anthropic Claude: the app supports both), Model Context Protocol, AG Grid, Render.

## Inspiration
Agents are about to spend money, and the hard question is not whether an AI can call a payments API but what stops a bad invoice, a hijacked agent or a prompt-injected document from draining an account.

## What it does
Invoices and AI agents *request* payments. A deterministic policy engine, which never reads document text, *decides* against a human-defined mandate (budget, caps, approved vendors, velocity). Allowed payments are queued with a cancel window and sent through PayPal Payouts; borderline ones go to a person with a one-time approval bound to the exact payee and amount; the rest are blocked. Any MCP-capable agent can use it through three bounded tools.

## How we built it
**PayPal:** Payouts API with a stable `sender_batch_id` and `PayPal-Request-Id` for idempotency, a transactional outbox worker, webhook signature verification, authoritative re-reads of payout items, and reconciliation.
**AI:** a Gemini (or Claude) model reads invoices (text, PDF, image) into schema-validated JSON with no tools and no authority, and in the same call flags any instructions hidden in the document. Decisions are worded by a template (or optionally by the model). Outputs are untrusted and validated. If the AI cannot read a document, it fails closed to a human.
**Agent gateway:** an MCP server whose keys are bound to one mandate each.

## Challenges
Making "AI in the loop" safe: the answer was an architecture where the model can change fields but never authority. Crash-safe payments: the outbox, unknown-outcome state and reconciliation. Honest security: tamper-evident (not tamper-proof) audit, and a limitations document.

## Accomplishments
45 automated tests including a 12-invoice scenario suite; maker-checker controls on vendors, mandates and approvals; a UI that shows every gate a payment had to pass.

## What's next
Partner onboarding for multi-tenant use, KMS-backed keys, anchored audit hashes, passkeys, multi-currency, and a formal security review.

## How judges can run it
See README quick start (about five minutes), or the hosted demo URL. `PAYPAL_MODE=simulated` and `AI_MODE=mock` run everything with no credentials.
