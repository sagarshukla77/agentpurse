# Security

AgentPurse handles (sandbox) money, so it is built around a few principles. This document states what is implemented and, just as importantly, what is not.

**Reporting a vulnerability:** open a private security advisory on the repository. Please do not file public issues for security bugs.

## Principles

1. **The AI has no authority.** LLM calls have no tools. Their output is schema-validated, then becomes a *proposal*. Only the policy engine (a pure function over structured fields) can allow a payment, and it never reads document text.
2. **Fail closed.** Unreadable documents, failed validation, unavailable classifier: a person reviews; nothing is guessed through. The kill switch is enforced inside the worker at the last moment.
3. **Separation of duties.** The person who adds a vendor cannot verify it. The person who drafts a mandate cannot activate it. The person who submitted an invoice cannot approve it.
4. **Idempotent money movement.** Stable per-invoice `sender_batch_id` and `PayPal-Request-Id`. The decision and the payment intent commit in one transaction under a row lock on the mandate. Crashes leave `SUBMITTING`/`UNKNOWN`, which reconciliation heals; retries reuse the same IDs so PayPal de-duplicates.
5. **Provenance.** Payout destinations come only from the verified vendor registry. An email on an invoice is compared against the registry, never used.

## Implemented controls

| Area | Control |
|---|---|
| Authentication | scrypt password hashing (N=2^15), constant-time verification incl. unknown users, TOTP (RFC 6238) for owners/approvers, 8 h signed HttpOnly SameSite=Lax cookies |
| Authorisation | Role matrix (owner / approver / viewer), enforced in one wrapper for every route |
| CSRF | Custom required header + Origin check on every browser mutation |
| Approvals | One-time HMAC-signed token bound to invoice, vendor, amount, currency, decision hash and approver; 10-minute expiry; step-up TOTP above a threshold |
| Input | Hand-rolled schema validation on all input; upload type checked by magic bytes, 2 MB cap; body-size limits; no URL fetching from document content |
| Rate limits | Per-route and per-agent sliding windows; login limited to 8/min/IP |
| Data at rest | Vendor payout emails and source documents encrypted with AES-256-GCM (app-level); extracted data stores masked emails; no card or bank data ever touches the system |
| Audit | SHA-256 hash chain, advisory-locked appends, DB trigger forbidding UPDATE/DELETE/TRUNCATE, one-click verification |
| Webhooks | Signature verified via PayPal's verification API, replay-proof by event ID, and treated only as a trigger: the item is re-read from PayPal and applied monotonically |
| AI | Daily call cap, per-minute throttle and bounded retries, prompt-injection layers, outputs escaped by React and validated by schema, no tools attached; provider-agnostic (Gemini or Claude) |
| Transport/headers | CSP (no external origins), HSTS, X-Frame-Options DENY, nosniff, strict referrer policy |
| Guard rails | App refuses to start against a non-sandbox PayPal URL |

## Not implemented (see LIMITATIONS.md)

Key management beyond environment variables (use a KMS in production), external penetration testing, multi-tenant isolation, passkeys/WebAuthn, distributed rate limiting, audit-head anchoring to an external store, formal compliance (SOC 2, PCI scope review, AML/KYC), and a real incident-response process.

## Prompt injection: an honest statement

Heuristics and an LLM classifier raise the cost of an attack but are **probabilistic**; they will miss some. The defence that does not depend on detection is architectural: even a perfectly crafted document can change only the *extracted fields*, and those pass through the same limits (cap, budget, allowlist, verified payee, first-payment approval, velocity) that would stop the same request from anyone else. The worst a successful injection can do is submit a payment that is already within the mandate, to a vendor a human has already verified.
