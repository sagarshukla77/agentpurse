# Limitations

This is a hackathon prototype built to a high engineering standard, but it is **not a production payments system**, and it should not be described as one.

## Not production-ready, because

- **Sandbox only.** It refuses to run against live PayPal. Live Payouts needs PayPal's own approval and risk review, and availability varies by country.
- **No external assurance.** No penetration test, code audit, SOC 2 or PCI scope review.
- **Compliance is out of scope.** Moving money for others can trigger money-transmission, AML/KYC, sanctions-screening, tax-form and data-protection obligations (for example GDPR, India's DPDP Act). None are implemented and this is not legal advice.
- **Single tenant.** One organisation, shared PayPal credentials in environment variables. A real product would use PayPal's partner/OAuth onboarding so each customer grants scoped access, plus tenant isolation.
- **Secrets and keys** live in environment variables. Production needs a KMS/HSM, rotation, and separation of encryption keys from the database host.
- **Audit chain is tamper-evident, not tamper-proof.** Anchor its head hash to an external write-once store.
- **Rate limiting is in-memory** (per instance, resets on restart).
- **Documents go to a third-party AI provider.** A real deployment needs a data-processing agreement, retention controls and region choice. On Google's free Gemini tier, prompts and responses may be used to improve Google's products and can be read by human reviewers, so only ever use fake or sample invoices with it; paid tiers do not use content for training.
- **Hosted-demo AI fallback.** With `AI_FALLBACK_MOCK=true` (only honoured when `DEMO_MODE=true`), an outage of the free AI tier makes the app read demo-format invoices with a simple offline parser instead of failing. It is labelled "offline parser" in the audit trail and timeline, and it must never be enabled in a real deployment, where an unreadable document goes to a human.
- **AI injection defence is probabilistic.** The architectural controls (limits, verified payees, approvals) are the real protection.
- **Single currency per mandate; no FX.**
- **Payouts are effectively irreversible** once claimed by the recipient. The cancel window, first-payment approval and kill switch reduce but do not remove that risk. No chargeback or recovery process exists.
- **Operations:** no on-call, incident response, SLOs, backups policy, load testing or chaos testing.
- **Tested vs. untested.** The core (policy, risk, crypto, tokens, audit chain, state machines, scenarios) is covered by 45 automated tests. The database repositories, the PayPal client and the UI were type-checked but have not been exercised against a live database or the real PayPal sandbox in this repository's test suite; run the quick start and the Playground to verify them in your environment.

## Deliberately out of scope for the prototype

Passkeys/WebAuthn, an LLM "investigator" agent, multi-currency, charts, accounting integrations, email ingestion, billing.
