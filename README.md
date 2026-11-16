# ClearChain Demo

Payment Certainty Layer on a shared coordination notebook (tonight: in-memory rules engine; tomorrow: Drunix Fabric chaincode).

**Not** the earlier `citi-npci-escrow` PoC — this is a separate repo and story.

## Plain English

See [LAYMAN.md](./LAYMAN.md).

## Tonight (guaranteed demo)

```bash
# Terminal 1 — API (memory mode)
cd api
npm install
npm run dev

# Terminal 2 — UI
cd frontend
npm install
npm run dev
```

- API: http://localhost:4000  
- UI: http://localhost:3000  
- `DEMO_MODE=memory` is the default (no Docker / Fabric required).

## Tomorrow (optional Fabric)

1. Keep the same Go contracts under `chaincode/`.
2. From Drunix `test-network` (WSL): deploy with `-ccn clearchain -ccp <path-to-this>/chaincode -ccl go`.
3. Run API with `DEMO_MODE=fabric` (gateway wiring — next iteration).

## What the live demo shows

1. Mark a bank **DEGRADED** → next payment **fails before debit**.
2. Healthy path → escrow confirmed → **instant float payout** to Raju (RRN recorded).
3. Same RRN again → **rejected** (no double pay).
4. Stuck payment past demo deadline → **watcher auto-reverses**.
5. Optional: cascade split / proportionate fraud hold.
