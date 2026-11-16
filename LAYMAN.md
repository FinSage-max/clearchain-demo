# ClearChain — what we built and why (plain English)

## The problem in one breath

When you pay with UPI, the “payment successful” screen is fast. What happens *around* that payment is still messy:

1. If a bank’s systems are struggling, payments can still be pushed into them — customers get stuck in “was I charged or not?”
2. A shopkeeper (like Raju) often waits 1–2 days for the Payment Aggregator to settle money that already landed in escrow.
3. Fraud money moves in minutes across mule accounts, ATMs, or even a real shop — while the complaint and lien arrive later. Nationally only about **~2%** of lost funds are restored to victims. That is not mainly “banks forgot to try.”

Rules already exist (RBI turnaround times, PA escrow, court rulings against whole-account freezes, CFCFRMS for cyber-fraud liens). What’s missing is a **shared place where the right parties agree on the state of one payment / one fraud trail** and act together.

## What ClearChain is

A **shared notebook** keyed by payment RRN and fraud case:

- Bank healthy or not?
- Escrow confirmed → float advance to merchant?
- Stuck past deadline → reverse?
- Supply cascade with consent?
- Fraud: where did the ₹100 go, and what outcome is allowed?

Tonight it runs in memory on your laptop. Tomorrow the same rules can sit on **Drunix** (Fabric), with multi-party endorsement.

## What we built

| Piece | Human meaning |
| --- | --- |
| **Health flag** | Degraded bank → **fail before debit** |
| **Escrow-confirmed advance** | After escrow OK, pay Raju from float now |
| **RRN lock** | Same ID twice → reject (no double pay) |
| **TAT watcher** | Stuck past deadline → auto-reversal record |
| **Cascade** | Tier-1 consents → split to Tier-2 |
| **Fraud trail (full)** | Hop graph + policy outcomes below |

## Fraud trail — the important part (why ~2%)

**CFCFRMS / 1930 already** alerts banks to mark liens. We do **not** replace that.

**We add** a shared trail with honest outcomes:

| Scenario (in the UI) | What happens | Outcome code |
| --- | --- | --- |
| ₹100 still in mule when case lands | Hold only ₹100; rest of account usable | `LIEN_ACTIVE` |
| Fraudster ATM-withdraws before freeze | Cannot invent cash back; record evidence; block future credits on Layer-1 | `OUTFLOWED` + `PREVENT_FURTHER_CREDIT` |
| Money hops Layer-1 → Layer-2 | Empty L1 → follow to L2 and lien there if funds remain | `HOP_FOLLOW` then lien |
| Fraudster pays **Raju for a real repair** | Trace the hop; **do not** auto-hold the shopkeeper | `GOOD_FAITH_EXIT` |
| Investigator marks shop as fake/mule | Then proportionate hold on merchant is allowed | `LIEN_ACTIVE` (after suspect flag) |
| Two victims, only ₹150 left in pot | Split what’s left | `PRO_RATA_LIEN` |
| Someone tries to freeze whole salary a/c | Rejected | `REJECTED_WHOLE_ACCOUNT` |

**Lien ≠ refund.** Even a perfect lien still waits on police/court before the victim sees money. That gap alone keeps restore rates tiny.

So ClearChain’s fraud story is: **hold what’s still holdable, faster and fairer; say clearly when money is already gone or sitting with an honest shop; never pretend we recovered cash that left the system.**

## Why this is useful

- Raju gets paid the same day (settlement spine).
- Customers avoid mystery debits when a bank is sick.
- Banks/PAs get one RRN timeline.
- Investigators/banks share one hop graph with **policy** (not panic whole freezes).
- You can explain the ~2% number without hand-waving.

## What we do *not* claim

- Not replacing NPCI UPI, TReDS, or CFCFRMS.
- Not putting UPI hot-path on a blockchain.
- Not magically recovering ATM cash or good-faith shop spend.
- Fabric multi-org live deploy = tomorrow; logic is proven tonight.

## Click-through

1. Pay Raju → instant float → retry same RRN (fail).
2. Degrade bank → fail before debit.
3. Stuck payment → watcher reverse.
4. **Fraud section:** run each scenario; read the amber explainer after each.
5. Sleep. Tomorrow: Fabric wiring + polish.
