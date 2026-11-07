# AgentPurse

**Give your AI a budget, not your bank login.**

AgentPurse is a payments control plane for AI agents. Invoices and agents *ask* to pay a vendor; a deterministic policy engine *decides*; PayPal Payouts *moves the money*, only when every gate is open. It runs against the PayPal **sandbox**.

> Built for the *Build What's Next with PayPal and AI* hackathon.

## The idea in one paragraph

Agents are about to spend money. The unsolved problem is not "can an AI call a payments API", it is "what stops a bad invoice, a hijacked agent, or a prompt-injected document from draining the account?" AgentPurse answers with one rule: **the AI proposes, plain code decides.** The model reads documents and explains decisions, but it has no tools and no authority. The only component that can authorise a payment is a pure, unit-tested function that never sees document text, so a document cannot talk its way past a rule.

## What it does

| | |
|---|---|
| **Mandates** | Spending authority you delegate: budget, per-payment cap, auto-approve limit, payments/hour, approved vendors, expiry. A second person must activate each mandate (maker-checker). |
| **Policy engine** | 18 rules, all evaluated, every one shown in the UI as a "gate". Any denial beats any escalation. |
| **AI extraction** | An AI model (Google Gemini on its free tier, or Claude) reads pasted text, PDFs and images into a schema-validated JSON proposal. Output that fails validation is rejected, never "fixed". Unreadable documents go to a human; the system fails closed. |
| **Prompt-injection defence** | Three layers: keyword heuristics, the AI's own "this document is trying to instruct me" flag (raised in the same call that reads the invoice), and (the one that matters) the policy engine never reads document text at all. |
| **Verified payees only** | Money goes to the vendor *registry*, never to an email written on an invoice. A different person must verify each vendor, recording how. |
| **Human approvals** | Escalations go to a person. Approval is a one-time signed token bound to the exact invoice, payee, amount and decision; if anything changes, it is void. Large amounts need a fresh authenticator code. |
| **Safe payments** | Transactional outbox, stable idempotency keys, a cancel window before money leaves, a worker that survives crashes, and reconciliation against PayPal. |
| **Agent gateway (MCP)** | Any MCP-capable agent (Claude Desktop, etc.) gets three tools bound to one mandate. It can be refused, held for approval, or paid, and can never exceed its authority. |
| **Kill switch** | One click freezes everything. Checked again inside the worker at the last moment. |
| **Tamper-evident audit** | Every action is hash-chained; a "verify" button proves nothing was edited or removed. The table is append-only at the database level. |
| **Dry run** | "What would the last 30 days have looked like under these limits?" before you change anything. |

## Architecture

```
 Browser (Next.js + AG Grid)            AI agents (Claude Desktop, bots)
        │  session cookie + CSRF header          │  Bearer agent key (JSON-RPC / MCP)
        ▼                                         ▼
 ┌─────────────────────────  Next.js API routes  ──────────────────────────┐
 │  api() wrapper: rate limit · CSRF · session · RBAC · body limits · errors │
 └───────┬──────────────────────────────────────────────────────┬──────────┘
         ▼                                                      ▼
   Pipeline (services/pipeline.ts)                         Webhook handler
   1 extract  (AI, no tools)                               verify signature
   2 injection screen                                      drop replays (event id)
   3 risk checks  ┐                                        re-read item from PayPal
   4 policy engine┘ one TX, mandate row-locked             apply status monotonically
   5 record decision (+ payment intent / approval)
         │                                                      ▲
         ▼                                                      │
   Postgres  ◄──── Outbox worker ──► PayPal Payouts ────────────┘
   (payments table = outbox; audit table = hash chain, append-only)
```

Layers, from the inside out, with dependencies pointing inward:

- `src/core/` pure TypeScript, zero dependencies on Next, the DB or the network: policy, risk, state machines, audit chain, crypto, tokens, TOTP. **This is what the tests cover.**
- `src/ai/`, `src/paypal/` thin clients for the two external systems.
- `src/server/` repositories (SQL), services (orchestration), HTTP wrapper.
- `src/app/api/` route handlers; `src/mcp/` the agent gateway.
- `src/app/`, `src/components/` the UI. `ui/` primitives, `domain/` product components.

## Quick start (about 5 minutes)

```bash
git clone <this repo> && cd agentpurse
cp .env.example .env              # then fill the three secrets: openssl rand -base64 32
docker compose up -d              # Postgres
npm install
npm run db:migrate
npm run db:seed                   # prints logins and an agent key
npm run dev                       # http://localhost:3000   (INLINE_WORKER=true runs payments in-process)
```

Open the app, sign in as `owner@agentpurse.demo` (password in `.env`, default `demo-password-change-me`), go to **Playground**, and press *Run all in order*. To run it again from a clean slate, press **Reset demo data** (owner only, `DEMO_MODE=true` only; it never touches the audit trail).

No PayPal credentials yet? Set `PAYPAL_MODE=simulated` and the whole flow runs locally, clearly labelled "simulated" in the UI. No paid key? **Use the free tier**: set `AI_MODE=gemini` and a free `GEMINI_API_KEY` from aistudio.google.com/apikey (no credit card), then run `npm run ai:check` to prove it works. `AI_MODE=mock` is an offline parser for the demo-invoice format only; it is not AI, so do not submit with it. Free-tier requests are rate-limited, so the app spaces calls out (`AI_MAX_RPM`).

### Connecting PayPal (sandbox)

1. Create a developer account at developer.paypal.com and, under *Sandbox → Accounts*, one **Business** account (the payer) and a few **Personal** accounts (the vendors).
2. Create a REST app **using the business account**; copy the Client ID and Secret into `.env`.
3. Set `DEMO_VENDOR_EMAIL_NORTHWIND`, `..._ACME`, `..._LUMEN` to the personal sandbox emails, **then** run `npm run db:seed`.
4. Create a webhook pointing at `https://<your-host>/api/webhooks/paypal`, subscribe to all `PAYMENT.PAYOUTS-ITEM.*` events, and put its ID in `PAYPAL_WEBHOOK_ID`. (Even without webhooks, reconciliation polls PayPal, so payments still settle.)
5. `PAYPAL_MODE=live` (it means *sandbox*; the app refuses any non-sandbox URL).

### Connecting an AI agent (MCP)

Create a key on the **Agents** page, then add the snippet it shows to Claude Desktop's config. The agent gets `request_payment`, `check_budget` and `get_payment_status`. Ask it to pay something large and watch it be refused.

### Deploy on Render

`render.yaml` is a Blueprint: one web service (worker inlined) plus Postgres. Set `ENCRYPTION_KEY`, the PayPal and (optionally) Anthropic variables in the dashboard.

## Who can sign in, and what each role can do

There is **no public sign-up**: only accounts created by an administrator can sign in. Sign-in is a password (scrypt-hashed) plus, for owners and approvers, an authenticator-app code (TOTP). Sessions are signed, HttpOnly, 8-hour cookies, every browser mutation carries a CSRF header, and login is rate-limited and audited. Hosted demos set `DEMO_MODE=true`, which skips the authenticator code and shows one-click demo accounts; never do that for real use.

| Can… | Viewer | Approver | Owner |
|---|:-:|:-:|:-:|
| See invoices, vendors, mandates, audit trail | ✓ | ✓ | ✓ |
| Submit invoices, cancel a queued payment | | ✓ | ✓ |
| Approve or reject escalated payments | | ✓ | ✓ |
| Verify vendors, activate mandates | | ✓ | ✓ |
| Engage the kill switch | | ✓ | ✓ |
| Add vendors, draft mandates, issue agent keys | | | ✓ |
| Release the kill switch, reset demo data | | | ✓ |

Separation of duties is enforced on top of roles: nobody can approve an invoice they submitted, verify a vendor they added, or activate a mandate they drafted. AI agents authenticate differently, with a revocable bearer key bound to one mandate, and can only use the three MCP tools. In this prototype new users are created by the seed script (there is no invite screen yet).

## Tests

```bash
npm test        # 46 tests, no database or network needed
```

They cover the policy engine branch by branch, risk checks, the injection heuristics, AES-GCM, scrypt, TOTP against the RFC 6238 vector, approval-token binding (any changed field voids it), session forgery, rate limiting, RBAC, upload magic-byte validation, the audit chain (edit, delete and reorder are all detected), payment-state monotonicity, replay, and a **12-invoice scenario suite** that runs the real extraction → risk → policy path against the same world the seed script builds:

| fixture | verdict | reasons |
|---|---|---|
| 01 routine invoice, trusted vendor | ALLOW | none |
| 02 monthly hosting | ALLOW | none |
| 03 first payment to a new vendor | ESCALATE | FIRST_PAYMENT |
| 04 above the auto-approve limit | ESCALATE | OVER_APPROVAL_THRESHOLD |
| 05 above the per-payment cap | DENY | OVER_PER_PAYMENT_CAP (+ threshold, anomaly) |
| 06 same invoice sent twice | DENY | DUPLICATE |
| 07 invoice that instructs the AI | DENY | PROMPT_INJECTION |
| 08 payee email changed on the invoice | ESCALATE | PAYEE_MISMATCH |
| 09 vendor never registered | DENY | VENDOR_UNKNOWN |
| 10 vendor awaiting verification | DENY | VENDOR_UNVERIFIED |
| 11 line items do not add up | ESCALATE | MATH_MISMATCH |
| 12 unexpected currency | DENY | CURRENCY_MISMATCH |

`npm run typecheck` runs the TypeScript compiler over everything.

## Safety model, honestly

Read [`docs/SECURITY.md`](docs/SECURITY.md), [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md) and [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md). In short: this is designed with bank-style controls (least privilege, separation of duties, idempotency, tamper-evident audit, fail-closed AI), runs **sandbox only**, and is a pilot-ready foundation, **not** a production payments product. It has had no external security review and has none of the compliance coverage a regulated product needs. `LIMITATIONS.md` lists what is missing.

## What was built during the hackathon

Everything in this repository was written for the hackathon: the policy engine, pipeline, PayPal and MCP integrations, UI and tests.

## License

MIT, see [LICENSE](LICENSE).
