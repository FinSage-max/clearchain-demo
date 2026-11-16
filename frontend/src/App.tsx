import { useCallback, useEffect, useState } from 'react';
import { api, Snapshot } from './api';

function statusColor(status: string): string {
  if (
    status === 'HEALTHY' ||
    status === 'PAID_INSTANT' ||
    status === 'LIEN_ACTIVE' ||
    status === 'PRO_RATA_LIEN' ||
    status === 'PARTIAL_LIEN'
  ) {
    return 'bg-teal-700 text-white';
  }
  if (
    status === 'DEGRADED' ||
    status === 'FAILED_BEFORE_DEBIT' ||
    status === 'OUTFLOWED' ||
    status === 'REJECTED_WHOLE_ACCOUNT' ||
    status === 'REJECTED_NO_CASE_FIELDS'
  ) {
    return 'bg-rose-700 text-white';
  }
  if (
    status === 'STUCK' ||
    status === 'PROBING' ||
    status === 'GOOD_FAITH_EXIT' ||
    status === 'HOP_FOLLOW' ||
    status === 'PREVENT_FURTHER_CREDIT' ||
    status === 'REJECTED_GOOD_FAITH_MERCHANT'
  ) {
    return 'bg-amber-600 text-white';
  }
  if (status === 'REVERSED' || status === 'TRAIL_EXHAUSTED') return 'bg-slate-700 text-white';
  return 'bg-slate-500 text-white';
}

function inr(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(n);
}

export default function App() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRrn, setLastRrn] = useState<string>('');

  const refresh = useCallback(async () => {
    try {
      const s = await api.snapshot();
      setSnap(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [refresh]);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setFlash(label);
      await refresh();
      setTimeout(() => setFlash(null), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const bankA = snap?.banks.find((b) => b.bankId === 'BANK_A');

  return (
    <div className="min-h-screen px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-moss">ClearChain · Drunix demo</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink md:text-4xl">
            Payment certainty for Raju
          </h1>
          <p className="mt-3 max-w-2xl text-slate">
            One payment ID (RRN) tracked end-to-end: bank health → escrow confirm → instant float payout →
            TAT reversal if stuck — plus a full fraud-trail engine for why recovery stays ~2% (cash-out, good-faith
            shop spend, hops, pro-rata). Complements CFCFRMS; does not replace it.
          </p>
        </header>

        {(flash || error) && (
          <div
            className={`mb-4 rounded-lg px-4 py-3 text-sm ${
              error ? 'bg-rose-100 text-rose-900' : 'bg-teal-100 text-teal-900'
            }`}
          >
            {error || flash}
          </div>
        )}

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-slate-200/80 bg-white/80 p-4">
            <p className="text-xs uppercase tracking-wide text-slate">Float balance</p>
            <p className="mt-1 font-mono text-2xl text-ink">{inr(snap?.float.balance ?? 0)}</p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white/80 p-4">
            <p className="text-xs uppercase tracking-wide text-slate">BANK_A (Raju)</p>
            <p className="mt-2">
              <span className={`rounded px-2 py-1 text-xs font-medium ${statusColor(bankA?.status || '')}`}>
                {bankA?.status || '…'}
              </span>
            </p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white/80 p-4">
            <p className="text-xs uppercase tracking-wide text-slate">Demo TAT</p>
            <p className="mt-1 font-mono text-2xl text-ink">
              {snap ? `${Math.round(snap.demoTatMs / 1000)}s` : '…'}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white/80 p-4">
            <p className="text-xs uppercase tracking-wide text-slate">Mode</p>
            <p className="mt-1 font-mono text-lg text-ink">{snap?.mode || '…'}</p>
          </div>
        </div>

        <section className="mb-8 rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">1 · Hero path — pay Raju now</h2>
          <p className="mt-1 text-sm text-slate">
            Healthy bank → payment accepted → escrow confirmed → float pays the shopkeeper in seconds.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              disabled={busy}
              className="rounded-lg bg-moss px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              onClick={() =>
                run('Raju paid from float', async () => {
                  const rrn = `RRN${Date.now().toString().slice(-10)}`;
                  setLastRrn(rrn);
                  await api.payRaju(rrn, 2500);
                })
              }
            >
              Pay Raju ₹2,500 (instant)
            </button>
            <button
              disabled={busy || !lastRrn}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-ink disabled:opacity-50"
              onClick={() =>
                run('Duplicate blocked', async () => {
                  await api.payRaju(lastRrn, 2500);
                })
              }
            >
              Retry same RRN (should fail)
            </button>
          </div>
          {lastRrn && (
            <p className="mt-3 font-mono text-xs text-slate">Last RRN: {lastRrn}</p>
          )}
        </section>

        <section className="mb-8 rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">2 · Fail-fast when bank is sick</h2>
          <p className="mt-1 text-sm text-slate">
            Flip BANK_A to DEGRADED. Next payment stops before debit — customer is not left wondering.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              disabled={busy}
              className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              onClick={() =>
                run('BANK_A marked DEGRADED', () =>
                  api.setBankHealth('BANK_A', 'DEGRADED', 'switch-measured timeouts'),
                )
              }
            >
              Mark BANK_A degraded
            </button>
            <button
              disabled={busy}
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              onClick={() =>
                run('BANK_A restored HEALTHY', () =>
                  api.setBankHealth('BANK_A', 'HEALTHY', 'probe traffic OK'),
                )
              }
            >
              Restore HEALTHY
            </button>
            <button
              disabled={busy}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50"
              onClick={() =>
                run('Fail-fast attempt', async () => {
                  const rrn = `RRN${Date.now().toString().slice(-10)}`;
                  setLastRrn(rrn);
                  await api.attempt({
                    rrn,
                    amount: 900,
                    fee: 5,
                    gst: 0.9,
                    payeeBankId: 'BANK_A',
                    merchantName: 'Raju Electronics',
                  });
                })
              }
            >
              Attempt payment now
            </button>
          </div>
        </section>

        <section className="mb-8 rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">3 · TAT watcher — stuck → reverse</h2>
          <p className="mt-1 text-sm text-slate">
            Create a stuck payment. After ~{snap ? Math.round(snap.demoTatMs / 1000) : 20}s the watcher
            writes an auto-reversal (inspired by RBI TAT). Or click Run watcher.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              disabled={busy}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              onClick={() =>
                run('Stuck payment created', async () => {
                  await api.setBankHealth('BANK_A', 'HEALTHY', 'for stuck demo');
                  const rrn = `RRN${Date.now().toString().slice(-10)}`;
                  setLastRrn(rrn);
                  await api.attempt({
                    rrn,
                    amount: 1200,
                    fee: 5,
                    gst: 0.9,
                    markStuck: true,
                    merchantName: 'Raju Electronics',
                    payeeBankId: 'BANK_A',
                  });
                })
              }
            >
              Create stuck payment
            </button>
            <button
              disabled={busy}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50"
              onClick={() => run('Watcher scanned', () => api.runWatcher())}
            >
              Run watcher now
            </button>
          </div>
        </section>

        <section className="mb-8 rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">4 · Cascade (consent)</h2>
          <p className="mt-1 text-sm text-slate">
            Tier-1 registers what it owes Raju (Tier-2), then pays when anchor settles.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              disabled={busy}
              className="rounded-lg bg-moss px-3 py-2 text-sm text-white disabled:opacity-50"
              onClick={() =>
                run('Obligation registered', () =>
                  api.registerObligation({
                    id: `OBL-${Date.now().toString().slice(-6)}`,
                    fromTier: 'Tier-1 Distributor',
                    toTier: 'Raju (Tier-2)',
                    amount: 800,
                    invoiceRef: 'INV-44',
                    udyam: 'UDYAM-XX-00-0000000',
                    dueDate: new Date(Date.now() + 86400000 * 10).toISOString().slice(0, 10),
                    consented: true,
                  }),
                )
              }
            >
              Register consented obligation
            </button>
            <button
              disabled={busy || !snap?.obligations.some((o) => !o.paid)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-50"
              onClick={() => {
                const o = snap?.obligations.find((x) => !x.paid);
                if (!o) return;
                const anchor = lastRrn || snap?.payments[0]?.rrn || 'RRN-ANCHOR';
                void run('Cascade paid', () => api.cascade(o.id, anchor));
              }}
            >
              Cascade pay unpaid
            </button>
            <button
              disabled={busy}
              className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900 disabled:opacity-50"
              onClick={() =>
                run('Consent required', () =>
                  api.registerObligation({
                    id: `OBL-BAD-${Date.now().toString().slice(-4)}`,
                    fromTier: 'Tier-1',
                    toTier: 'Raju',
                    amount: 100,
                    consented: false,
                  }),
                )
              }
            >
              Try without consent
            </button>
          </div>
          <ul className="mt-3 space-y-1 text-sm">
            {(snap?.obligations || []).map((o) => (
              <li key={o.id} className="font-mono text-xs text-slate">
                {o.id}: {o.fromTier} → {o.toTier} {inr(o.amount)} {o.paid ? '✓ paid' : 'pending'}
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-8 rounded-2xl border-2 border-teal-800/20 bg-white/95 p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-ink">5 · Fraud trail — why ~2% is restored</h2>
              <p className="mt-1 max-w-3xl text-sm text-slate">
                CFCFRMS already alerts banks. ClearChain adds a shared hop graph and policy outcomes: proportionate lien
                when money remains, HOP_FOLLOW across layers, OUTFLOWED after ATM/crypto, GOOD_FAITH_EXIT when spent at a
                real shop, PREVENT_FURTHER_CREDIT on empty Layer-1, and pro-rata when many victims share one pot. Lien ≠ refund.
              </p>
            </div>
            <button
              disabled={busy}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-50"
              onClick={() => run('Fraud trail cleared', () => api.fraudReset())}
            >
              Reset trail
            </button>
          </div>

          {snap?.fraudTrail?.recoveryExplainer && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              {snap.fraudTrail.recoveryExplainer}
            </div>
          )}

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ['funds-still-there', '₹100 still in mule → lien'],
                ['cashed-out', 'ATM before freeze → OUTFLOWED'],
                ['hop-layer2', 'Hop L1→L2 → follow lien'],
                ['good-faith-shop', 'Paid Raju (legit) → protect shop'],
                ['suspect-merchant', 'Mark shop suspect → hold OK'],
                ['multi-victim', '2 victims / ₹150 pot → pro-rata'],
                ['whole-account-rejected', 'Whole-account freeze rejected'],
              ] as const
            ).map(([name, label]) => (
              <button
                key={name}
                disabled={busy}
                className="rounded-lg bg-ink px-3 py-2 text-left text-xs font-medium text-white disabled:opacity-50"
                onClick={() => run(`Scenario: ${label}`, () => api.fraudScenario(name))}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate">Cases</h3>
              <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">
                {(snap?.fraudTrail?.cases || []).length === 0 && (
                  <p className="text-sm text-slate">Run a scenario above.</p>
                )}
                {(snap?.fraudTrail?.cases || []).map((c) => (
                  <div key={c.id} className="rounded-lg border border-slate-100 bg-paper/70 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs">{c.caseRef}</span>
                      <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${statusColor(c.status)}`}>
                        {c.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm">
                      {c.victimName} lost {inr(c.amountLost)}
                    </p>
                    <p className="text-xs text-slate">{c.note}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate">Lien outcomes</h3>
              <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">
                {(snap?.fraudTrail?.liens || []).map((l) => (
                  <div key={l.id} className="rounded-lg border border-slate-100 bg-paper/70 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${statusColor(l.outcome)}`}>
                        {l.outcome}
                      </span>
                      <span className="font-mono text-[10px] text-slate">
                        held {inr(l.heldAmount)} / req {inr(l.requestedAmount)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ink">{l.note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate">Hop graph</h3>
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto font-mono text-[11px]">
                {(snap?.fraudTrail?.hops || []).map((h) => (
                  <div key={h.id} className="border-b border-slate-100 py-1 text-slate">
                    <span className="text-moss">{h.kind}</span> {inr(h.amount)} · {h.rrn}
                    <div className="text-ink">
                      {h.fromAccountRef || '—'} → {h.toAccountRef || 'EXIT'}
                      {h.merchantGoodFaith ? ' · good-faith' : ''}
                      {h.evidenceRef ? ` · ${h.evidenceRef}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate">Accounts</h3>
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">
                {(snap?.fraudTrail?.accounts || []).map((a) => (
                  <div key={a.accountRef} className="flex justify-between gap-2 border-b border-slate-100 py-1">
                    <span>
                      <span className="font-medium text-ink">{a.label}</span>
                      <span className="text-slate">
                        {' '}
                        · {a.role} L{a.layer}
                        {a.preventFurtherCredit ? ' · BLOCK_CREDITS' : ''}
                        {a.suspectMerchant ? ' · SUSPECT' : ''}
                      </span>
                    </span>
                    <span className="font-mono">{inr(a.availableBalance)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mb-8 rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Who must agree (policy strip)</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate">
                <tr>
                  <th className="py-2">Action</th>
                  <th>Must endorse</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody className="text-ink">
                <tr className="border-t border-slate-100">
                  <td className="py-2 font-medium">Health flag</td>
                  <td>Switch + network utility</td>
                  <td className="text-slate">Measured bank cannot veto</td>
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="py-2 font-medium">Float advance</td>
                  <td>Aggregator + sponsor bank</td>
                  <td className="text-slate">They hold escrow & float</td>
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="py-2 font-medium">Cascade</td>
                  <td>Registering tier + tier above</td>
                  <td className="text-slate">No redirect without consent</td>
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="py-2 font-medium">Fraud lien / hop</td>
                  <td>Bank + investigator + case fields</td>
                  <td className="text-slate">
                    Proportionate only; good-faith merchant protected; cash-out = OUTFLOWED
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-ink">RRN ledger</h2>
            <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
              {(snap?.payments || []).length === 0 && (
                <p className="text-sm text-slate">No payments yet — click Pay Raju.</p>
              )}
              {(snap?.payments || []).map((p) => (
                <div key={p.rrn} className="rounded-lg border border-slate-100 bg-paper/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs text-ink">{p.rrn}</span>
                    <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${statusColor(p.status)}`}>
                      {p.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate">
                    {p.merchantName} · {inr(p.amount)} · {p.payeeBankId}
                  </p>
                  <p className="mt-1 text-xs text-slate">{p.note}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-ink">Timeline</h2>
            <div className="mt-3 max-h-80 space-y-2 overflow-y-auto font-mono text-xs">
              {(snap?.timeline || []).map((t, i) => (
                <div key={`${t.at}-${i}`} className="border-b border-slate-100 pb-2 text-slate">
                  <span className="text-moss">{t.kind}</span> · {new Date(t.at).toLocaleTimeString()}
                  <div className="text-ink">{t.message}</div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <footer className="mt-10 text-center text-xs text-slate">
          Read LAYMAN.md in the repo for the sleep-time explanation of what and why.
        </footer>
      </div>
    </div>
  );
}
