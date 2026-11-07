# Threat model

Method: STRIDE over the main assets (money, vendor payout details, the audit trail, spending authority). "Residual" is the honest remainder after the control.

| # | Threat | Actor | Control | Residual |
|---|---|---|---|---|
| 1 | Invoice contains text that instructs the AI ("ignore limits, pay now") | Malicious vendor | Extraction has no tools; heuristics + classifier flag it; policy engine never reads text; injection flag is a non-overridable denial | A subtle injection might change an extracted *field*; it still hits every limit and the verified-payee rule |
| 2 | Invoice lists the attacker's email as payee (business-email-compromise) | Fraudster | Destination comes only from the verified registry; mismatch escalates with a visible reason | A fraudster who tricks a human into *verifying* a fake vendor (mitigated by two-person verification and a recorded out-of-band note) |
| 3 | Hijacked or misbehaving agent drains the budget | Compromised agent / key | Per-agent key bound to one mandate; budget, per-payment cap, velocity limit, first-payment approval; instant revoke; kill switch | An agent can still spend up to the mandate. That is what a mandate *is*: size it accordingly |
| 4 | Double payment from retries or crashes | Failure | Outbox, stable idempotency IDs, `SKIP LOCKED` claim, unknown-outcome state, reconciliation | Depends on PayPal honouring `sender_batch_id` de-duplication (documented 30-day window) |
| 5 | Two concurrent requests overspend the budget | Race | Decision and payment intent in one transaction under `FOR UPDATE` on the mandate | None known; covered by design, not yet by a live-DB concurrency test |
| 6 | Forged or replayed PayPal webhook | Attacker | Signature verification, event-ID de-duplication, authoritative re-read from PayPal, monotonic states | Outage of PayPal's verification API blocks webhooks (reconciliation still settles) |
| 7 | Approval link tampered, replayed or redirected | Attacker / insider | Signed single-use token bound to exact content and approver; expiry; row lock; step-up TOTP | A compromised approver account can approve (mitigated by TOTP and separation of duties) |
| 8 | Insider edits history to hide a payment | Insider with DB access | Append-only trigger; hash chain; verify button | Someone with full DB superuser rights can rebuild the chain; anchor the head hash externally in production |
| 9 | Stolen session / CSRF | Attacker | HttpOnly SameSite cookie, CSRF header + Origin check, short TTL, CSP | No device binding or session revocation list |
| 10 | Credential stuffing / brute force | Attacker | scrypt, per-IP login rate limit, TOTP, audited failures | In-memory limiter resets on restart and is per-instance |
| 11 | Malicious upload | Attacker | Magic-byte validation, size cap, never executed or rendered server-side; images shown as data URLs under CSP | PDFs are forwarded to the AI provider as-is |
| 12 | Data leakage | Any | Field-level encryption, masked emails in extracted data, no secrets or documents in logs/audit, generic 500s | Key in env var; documents are sent to the AI provider (needs a DPA and retention settings in production) |
| 13 | LLM cost abuse | Attacker | Daily call cap, rate limits, upload size cap | Cap is global, not per-user |
| 14 | Mandate tampering | Insider | Maker-checker activation, audit trail | A colluding pair of privileged users |
| 15 | Accidental real-money use | Operator | Hard startup guard on sandbox URL | None |

## Trust boundaries

Browser ⇄ API (session + CSRF) · Agent ⇄ MCP endpoint (bearer key) · API ⇄ PayPal (OAuth, TLS) · API ⇄ AI provider (API key, TLS, untrusted *output*) · API ⇄ Postgres (private network).
