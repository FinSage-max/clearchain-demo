import { useCallback, useEffect, useState } from 'react';
import { api, Snapshot } from './api';

function statusColor(status: string): string {
  if (status === 'HEALTHY' || status === 'PAID_INSTANT') return 'bg-teal-700 text-white';
  if (status === 'DEGRADED' || status === 'FAILED_BEFORE_DEBIT') return 'bg-rose-700 text-white';
  if (status === 'STUCK' || status === 'PROBING') return 'bg-amber-600 text-white';
  if (status === 'REVERSED') return 'bg-slate-700 text-white';
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
            TAT reversal if stuck. Tonight runs in memory; same rules ship as Go chaincode for Drunix tomorrow.
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

        <section className="mb-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
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
                  {o.id}: {o.fromTier} → {o.toTier} {inr(o.amount)}{' '}
                  {o.paid ? '✓ paid' : 'pending'}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-ink">5 · Fair hold</h2>
            <p className="mt-1 text-sm text-slate">
              Hold only the disputed amount — case reference required (courts hate whole freezes).
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                disabled={busy}
                className="rounded-lg bg-moss px-3 py-2 text-sm text-white disabled:opacity-50"
                onClick={() =>
                  run('Proportionate hold set', () =>
                    api.createHold({
                      id: `HOLD-${Date.now().toString().slice(-6)}`,
                      accountRef: 'RAJU-ACC-hash',
                      amount: 500,
                      caseRef: 'NCRP-2026-001',
                      legalProvision: 'BNSS / CFCFRMS lien',
                      victimShare: 500,
                    }),
                  )
                }
              >
                Place ₹500 lien
              </button>
              <button
                disabled={busy}
                className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900 disabled:opacity-50"
                onClick={() =>
                  run('Whole freeze rejected', () =>
                    api.createHold({
                      id: `HOLD-BAD-${Date.now().toString().slice(-4)}`,
                      accountRef: 'RAJU-ACC-hash',
                      amount: 50000,
                      caseRef: '',
                      legalProvision: '',
                    }),
                  )
                }
              >
                Try freeze without case ref
              </button>
            </div>
            <ul className="mt-3 space-y-1 text-sm">
              {(snap?.holds || []).map((h) => (
                <li key={h.id} className="font-mono text-xs text-slate">
                  {h.id}: {inr(h.amount)} · {h.caseRef} · {h.status}
                </li>
              ))}
            </ul>
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
                  <td className="py-2 font-medium">Fraud hold</td>
                  <td>Bank + investigator + case fields</td>
                  <td className="text-slate">Proportionate lien only</td>
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
