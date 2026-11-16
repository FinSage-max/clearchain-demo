# ClearChain — what we built and why (plain English)

## The problem in one breath

When you pay with UPI, the “payment successful” screen is fast. What happens *around* that payment is still messy:

1. If a bank’s systems are struggling, payments can still be pushed into them — customers get stuck in “was I charged or not?”
2. A shopkeeper (like Raju) often waits 1–2 days for the Payment Aggregator to settle money that already landed in escrow.
3. If something goes wrong, banks sometimes freeze a whole account instead of just the disputed amount.

Rules for all of this already exist (RBI turnaround times, escrow rules, court rulings). What’s missing is a **shared place where the right parties agree on the state of one payment** and act together.

## What ClearChain is

Think of ClearChain as a **shared notebook** that payment companies and banks can trust:

- Every payment has an ID called an **RRN** (like a tracking number).
- The notebook records: bank healthy or not? escrow money confirmed? shopkeeper paid from a float? reversed because it got stuck? cascade to suppliers? hold only the disputed rupees?

Nobody can rewrite history quietly. Tonight that notebook runs on your laptop. Tomorrow the same rules can sit on **Drunix** (Hyperledger Fabric), where multiple organisations must *endorse* (digitally sign) the right actions.

## What we built tonight

| Piece | What it does in human terms |
| --- | --- |
| **Health flag** | Label a bank Healthy / Degraded. If Degraded, the demo **stops the payment before any debit** — fail fast, no mystery. |
| **Escrow-confirmed advance** | Once escrow credit is confirmed, pay Raju **immediately** from a pre-funded float (not magic money — it’s an advance against money already in escrow). |
| **RRN lock** | Same tracking number twice → second attempt **rejected**. No double payout. |
| **TAT watcher** | If a payment sits ambiguous past the demo deadline, an automatic **reversal record** is written (inspired by RBI’s ₹100/day / T+1 style rules). |
| **Cascade / fair hold (extra)** | Split a payment down the supply chain with consent, or hold only the disputed amount with a case reference. |

## Why this is useful (not just a tech demo)

- **Raju** gets working capital the same day he earned it.
- **Customers** are less likely to be stuck wondering if they were charged when a bank is sick.
- **Banks / aggregators** get one RRN timeline they can reconcile instead of chasing settlement files by hand.
- **Judges / tomorrow-you**: the “genius” bit is not “blockchain.” It’s **matching each action to who is accountable** (switch + network for health; aggregator + sponsor bank for payout; bank + investigator for a hold).

## What we did *not* claim tonight

- We did not replace NPCI UPI, TReDS, or the government’s cyber-fraud portal.
- We did not put the UPI hot path on a blockchain (routing uses a simple flag check).
- Fabric multi-org endorsement on a live Drunix network is the **tomorrow** plug-in; tonight proves the product logic end-to-end.

## How to click through before sleep

1. Open the UI → start on **Healthy** bank → run **Pay Raju** → see escrow confirm → instant credit.
2. Try the **same RRN** again → see reject.
3. Flip bank to **Degraded** → try pay → fail before debit.
4. Create a **stuck** payment → wait for watcher (or trigger check) → see reverse.
5. Read this file once more — that’s the story you tell tomorrow.
