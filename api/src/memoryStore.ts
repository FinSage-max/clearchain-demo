import { FraudTrailEngine } from './fraudTrail';
import {
  BankHealth,
  BankStatus,
  FloatAccount,
  FraudHold,
  Obligation,
  Payment,
  TimelineEvent,
} from './types';

function nowIso(): string {
  return new Date().toISOString();
}

/** Demo TAT window — short so watcher fires in the same session. */
export const DEMO_TAT_MS = Number(process.env.DEMO_TAT_MS || 20_000);

export class MemoryStore {
  banks = new Map<string, BankHealth>();
  payments = new Map<string, Payment>();
  obligations = new Map<string, Obligation>();
  /** Legacy simple holds (also mirrored into trail when possible). */
  holds = new Map<string, FraudHold>();
  floatAcct: FloatAccount;
  timeline: TimelineEvent[] = [];
  fraud: FraudTrailEngine;

  constructor() {
    this.fraud = new FraudTrailEngine((kind, message, meta) =>
      this.push(kind, message, meta?.rrn, meta?.caseId),
    );
    const t = nowIso();
    this.banks.set('BANK_A', {
      bankId: 'BANK_A',
      status: 'HEALTHY',
      updatedAt: t,
      reason: 'seed — Raju payee bank',
    });
    this.banks.set('BANK_B', {
      bankId: 'BANK_B',
      status: 'HEALTHY',
      updatedAt: t,
      reason: 'seed',
    });
    this.floatAcct = { id: 'PA_MAIN', balance: 500_000, updatedAt: t };
    this.push('SYSTEM', 'Ledger seeded: banks HEALTHY, float ₹5,00,000');
  }

  private push(kind: string, message: string, rrn?: string, caseId?: string) {
    this.timeline.unshift({ at: nowIso(), kind, message, rrn, caseId });
    if (this.timeline.length > 300) this.timeline.pop();
  }

  setBankHealth(bankId: string, status: BankStatus, reason: string): BankHealth {
    const row: BankHealth = {
      bankId,
      status,
      updatedAt: nowIso(),
      reason,
    };
    this.banks.set(bankId, row);
    this.push('HEALTH', `${bankId} → ${status} (${reason})`);
    return row;
  }

  attemptPayment(input: {
    rrn: string;
    merchantId: string;
    merchantName: string;
    payeeBankId: string;
    amount: number;
    fee: number;
    gst: number;
    markStuck?: boolean;
  }): Payment {
    if (this.payments.has(input.rrn)) {
      throw new Error(`RRN ${input.rrn} already exists — duplicate rejected`);
    }
    const health = this.banks.get(input.payeeBankId);
    if (!health) {
      throw new Error(`Unknown bank ${input.payeeBankId}`);
    }

    const createdAt = nowIso();
    const deadlineAt = new Date(Date.now() + DEMO_TAT_MS).toISOString();

    if (health.status === 'DEGRADED') {
      const failed: Payment = {
        rrn: input.rrn,
        merchantId: input.merchantId,
        merchantName: input.merchantName,
        payeeBankId: input.payeeBankId,
        amount: input.amount,
        fee: input.fee,
        gst: input.gst,
        status: 'FAILED_BEFORE_DEBIT',
        escrowConfirmed: false,
        floatAdvanced: false,
        createdAt,
        updatedAt: createdAt,
        deadlineAt,
        note: 'Payee bank DEGRADED — fail-fast, customer never debited',
      };
      this.payments.set(input.rrn, failed);
      this.push('FAIL_FAST', failed.note, input.rrn);
      return failed;
    }

    const status = input.markStuck ? 'STUCK' : 'PENDING_ESCROW';
    const p: Payment = {
      rrn: input.rrn,
      merchantId: input.merchantId,
      merchantName: input.merchantName,
      payeeBankId: input.payeeBankId,
      amount: input.amount,
      fee: input.fee,
      gst: input.gst,
      status,
      escrowConfirmed: false,
      floatAdvanced: false,
      createdAt,
      updatedAt: createdAt,
      deadlineAt,
      note: input.markStuck
        ? 'Deliberately left unconfirmed for TAT watcher demo'
        : 'Awaiting escrow confirmation at sponsor bank',
    };
    this.payments.set(input.rrn, p);
    this.push('PAYMENT', p.note, input.rrn);
    return p;
  }

  confirmEscrowAndAdvance(rrn: string): Payment {
    const p = this.payments.get(rrn);
    if (!p) throw new Error(`Payment ${rrn} not found`);
    if (p.status === 'FAILED_BEFORE_DEBIT') {
      throw new Error('Cannot advance a failed-before-debit payment');
    }
    if (p.floatAdvanced) {
      throw new Error(`RRN ${rrn} already advanced — duplicate rejected`);
    }
    if (p.status !== 'PENDING_ESCROW' && p.status !== 'STUCK') {
      throw new Error(`Payment ${rrn} in status ${p.status} cannot be advanced`);
    }

    const payout = p.amount - p.fee - p.gst;
    if (this.floatAcct.balance < payout) {
      throw new Error('Insufficient settlement float');
    }
    this.floatAcct.balance -= payout;
    this.floatAcct.updatedAt = nowIso();

    p.escrowConfirmed = true;
    p.floatAdvanced = true;
    p.status = 'PAID_INSTANT';
    p.updatedAt = nowIso();
    p.note = `Escrow confirmed — ₹${payout.toFixed(2)} advanced to ${p.merchantName} from float`;
    this.push('ADVANCE', p.note, rrn);
    return p;
  }

  markStuck(rrn: string): Payment {
    const p = this.payments.get(rrn);
    if (!p) throw new Error(`Payment ${rrn} not found`);
    if (p.floatAdvanced) throw new Error('Already advanced');
    p.status = 'STUCK';
    p.updatedAt = nowIso();
    p.note = 'Marked stuck / ambiguous — watcher eligible';
    this.push('STUCK', p.note, rrn);
    return p;
  }

  autoReverse(rrn: string): Payment {
    const p = this.payments.get(rrn);
    if (!p) throw new Error(`Payment ${rrn} not found`);
    if (p.floatAdvanced) {
      throw new Error('Float advanced — different liability path');
    }
    if (p.status === 'REVERSED') return p;
    p.status = 'REVERSED';
    p.updatedAt = nowIso();
    p.note = 'Watcher auto-reversal — immutable TAT record (no float was advanced)';
    this.push('REVERSE', p.note, rrn);
    return p;
  }

  runWatcher(): Payment[] {
    const now = Date.now();
    const reversed: Payment[] = [];
    for (const p of this.payments.values()) {
      if (p.floatAdvanced || p.status === 'REVERSED' || p.status === 'FAILED_BEFORE_DEBIT') {
        continue;
      }
      if (p.status !== 'STUCK' && p.status !== 'PENDING_ESCROW') continue;
      if (new Date(p.deadlineAt).getTime() <= now) {
        reversed.push(this.autoReverse(p.rrn));
      }
    }
    return reversed;
  }

  registerObligation(input: Omit<Obligation, 'paid' | 'anchorRrn'> & { consented: boolean }): Obligation {
    if (!input.consented) {
      throw new Error('Obligation rejected — upstream tier consent required');
    }
    const o: Obligation = { ...input, paid: false, anchorRrn: '' };
    this.obligations.set(o.id, o);
    this.push('OBLIGATION', `Registered ${o.fromTier} → ${o.toTier} ₹${o.amount}`);
    return o;
  }

  cascadePay(obligationId: string, anchorRrn: string): Obligation {
    const o = this.obligations.get(obligationId);
    if (!o) throw new Error('Obligation not found');
    if (!o.consented) throw new Error('No consent');
    o.paid = true;
    o.anchorRrn = anchorRrn;
    this.push('CASCADE', `Paid ${o.toTier} ₹${o.amount} via ${anchorRrn}`, anchorRrn);
    return o;
  }

  /** Legacy simple hold — still rejects missing case fields. */
  createHold(input: Omit<FraudHold, 'status' | 'createdAt'>): FraudHold {
    if (!input.caseRef?.trim() || !input.legalProvision?.trim()) {
      throw new Error(
        'Hold rejected — caseRef and legalProvision required (no whole-account freeze)',
      );
    }
    const h: FraudHold = {
      ...input,
      status: 'ACTIVE',
      createdAt: nowIso(),
    };
    this.holds.set(h.id, h);
    this.push(
      'HOLD',
      `Legacy proportionate hold ₹${h.amount} on ${h.accountRef} (${h.caseRef})`,
    );
    return h;
  }

  snapshot() {
    return {
      mode: 'memory',
      banks: [...this.banks.values()],
      payments: [...this.payments.values()].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
      float: this.floatAcct,
      obligations: [...this.obligations.values()],
      holds: [...this.holds.values()],
      fraudTrail: this.fraud.snapshot(),
      timeline: this.timeline,
      demoTatMs: DEMO_TAT_MS,
    };
  }
}

export const store = new MemoryStore();
