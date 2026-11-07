# 3-minute demo script

Record the screen at 1080p with voice-over only: no music, no third-party logos. Keep it under 3:00. Lead with the result.

Before recording: seed the database, set `PAYMENT_HOLD_SECONDS=20`, have the Playground and an agent key ready, and run the whole flow once to confirm.

| Time | Screen | Say |
|---|---|---|
| 0:00 | Login art | "AI agents are about to spend money. AgentPurse decides whether they're allowed to." |
| 0:12 | Control room | "This is the mandate: a budget, a hard cap per payment, an auto-approve limit. The AI is delegated authority; it never holds the keys." |
| 0:25 | Playground: run #1 | "A routine invoice. The AI reads it, every rule passes, and it is queued with a cancel window." Open it: show the gates and the timeline. |
| 0:55 | Run #3 → Approvals | "First payment to a new vendor always needs a person." Open the review: "Notice the payee comes from the verified registry, not the invoice." Approve. |
| 1:20 | Run #7 (injection) | "This invoice tells the AI to ignore its limits. It's blocked, and look: the policy engine never even saw that text." Show the denial and the notification. |
| 1:40 | Run #8 (payee changed) | "A vendor 'changed their bank details'. Escalated, not paid." |
| 1:55 | Claude Desktop | Ask the agent to pay $2,400 to Acme. "An external agent, same rules." Show the refusal, then `check_budget`. |
| 2:20 | Invoice detail → PAID | "PayPal confirmed it via webhook; we re-read it from PayPal rather than trusting the message." |
| 2:32 | Kill switch | Press it: "One click freezes everything, even queued payments." |
| 2:42 | Audit trail → Verify | "Every action is hash-chained." Verify: green. "Edit a row and it goes red." |
| 2:52 | Control room | "Give your AI a budget, not your bank login." |

Pre-flight checklist: repo public with LICENSE visible in About; README quick start works from a clean clone; video public on YouTube and under 3:00; submission text states the AI tools used and how; secrets not committed; submit a day early.
