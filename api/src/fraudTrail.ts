import {
  FraudCase,
  FraudHop,
  FraudTrailSnapshot,
  HopKind,
  LienAction,
  LienOutcomeStatus,
  TrailAccount,
} from './types';

function nowIso(): string {
  return new Date().toISOString();
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * ClearChain fraud trail engine.
 *
 * Complements CFCFRMS: we do not "detect" fraud. We record hops and apply
 * proportionate, policy-bound outcomes when a case lands — including the hard
 * cases where money already left (cash-out) or entered a good-faith merchant.
 */
export class FraudTrailEngine {
  cases = new Map<string, FraudCase>();
  accounts = new Map<string, TrailAccount>();
  hops: FraudHop[] = [];
  liens: LienAction[] = [];
  recoveryExplainer =
    'Recovery stays ~2% because liens only work on money still inside the banking system — and even then, lien ≠ refund to the victim.';

  private pushTimeline: (kind: string, message: string, meta?: { rrn?: string; caseId?: string }) => void;

  constructor(
    pushTimeline: (kind: string, message: string, meta?: { rrn?: string; caseId?: string }) => void,
  ) {
    this.pushTimeline = pushTimeline;
  }

  reset() {
    this.cases.clear();
    this.accounts.clear();
    this.hops = [];
    this.liens = [];
    this.recoveryExplainer =
      'Recovery stays ~2% because liens only work on money still inside the banking system — and even then, lien ≠ refund to the victim.';
  }

  upsertAccount(input: Omit<TrailAccount, 'updatedAt'> & { updatedAt?: string }): TrailAccount {
    const existing = this.accounts.get(input.accountRef);
    const row: TrailAccount = {
      ...existing,
      ...input,
      preventFurtherCredit: input.preventFurtherCredit ?? existing?.preventFurtherCredit ?? false,
      suspectMerchant: input.suspectMerchant ?? existing?.suspectMerchant ?? false,
      updatedAt: input.updatedAt || nowIso(),
    };
    this.accounts.set(row.accountRef, row);
    return row;
  }

  getAccount(ref: string): TrailAccount {
    const a = this.accounts.get(ref);
    if (!a) throw new Error(`Unknown trail account ${ref}`);
    return a;
  }

  openCase(input: {
    caseRef: string;
    legalProvision: string;
    victimName: string;
    amountLost: number;
    entryAccountRef: string;
    entryRrn: string;
  }): FraudCase {
    if (!input.caseRef?.trim() || !input.legalProvision?.trim()) {
      throw new Error('Case rejected — caseRef and legalProvision required');
    }
    const c: FraudCase = {
      id: uid('CASE'),
      caseRef: input.caseRef.trim(),
      legalProvision: input.legalProvision.trim(),
      victimName: input.victimName,
      amountLost: input.amountLost,
      entryAccountRef: input.entryAccountRef,
      entryRrn: input.entryRrn,
      status: 'OPEN',
      note: 'Complaint accepted — trail evaluation pending',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.cases.set(c.id, c);
    this.pushTimeline('FRAUD_CASE', `Opened ${c.caseRef} for ${c.victimName} ₹${c.amountLost}`, {
      caseId: c.id,
      rrn: c.entryRrn,
    });
    return c;
  }

  recordHop(input: {
    caseId: string;
    fromAccountRef: string | null;
    toAccountRef: string | null;
    rrn: string;
    amount: number;
    kind: HopKind;
    merchantGoodFaith?: boolean;
    merchantName?: string;
    evidenceRef?: string;
    note?: string;
  }): FraudHop {
    const c = this.cases.get(input.caseId);
    if (!c) throw new Error('Case not found');

    // Move demo balances along the hop when still inside the banking system.
    if (input.fromAccountRef && input.kind !== 'FRAUD_CREDIT') {
      const from = this.getAccount(input.fromAccountRef);
      from.availableBalance = Math.max(0, +(from.availableBalance - input.amount).toFixed(2));
      from.updatedAt = nowIso();
    }
    if (
      input.toAccountRef &&
      (input.kind === 'FRAUD_CREDIT' || input.kind === 'INTERNAL_TRANSFER')
    ) {
      const to = this.getAccount(input.toAccountRef);
      if (to.preventFurtherCredit && input.kind === 'FRAUD_CREDIT') {
        throw new Error(
          `Credit blocked — ${to.accountRef} has PREVENT_FURTHER_CREDIT (first-layer empty-account SOP)`,
        );
      }
      to.availableBalance = +(to.availableBalance + input.amount).toFixed(2);
      to.updatedAt = nowIso();
    }
    // Cash / crypto / good-faith merchant purchase: money leaves mule; merchant may receive banking credit.
    if (input.kind === 'MERCHANT_PURCHASE' && input.toAccountRef) {
      const merchant = this.getAccount(input.toAccountRef);
      merchant.availableBalance = +(merchant.availableBalance + input.amount).toFixed(2);
      merchant.updatedAt = nowIso();
    }

    const hop: FraudHop = {
      id: uid('HOP'),
      caseId: input.caseId,
      fromAccountRef: input.fromAccountRef,
      toAccountRef: input.toAccountRef,
      rrn: input.rrn,
      amount: input.amount,
      kind: input.kind,
      merchantGoodFaith: Boolean(input.merchantGoodFaith),
      merchantName: input.merchantName,
      evidenceRef: input.evidenceRef,
      at: nowIso(),
      note:
        input.note ||
        `${input.kind} ₹${input.amount}` +
          (input.merchantName ? ` → ${input.merchantName}` : ''),
    };
    this.hops.unshift(hop);
    this.pushTimeline('FRAUD_HOP', hop.note, { caseId: input.caseId, rrn: input.rrn });
    return hop;
  }

  private writeLien(partial: Omit<LienAction, 'id' | 'createdAt'>): LienAction {
    const row: LienAction = { ...partial, id: uid('LIEN'), createdAt: nowIso() };
    this.liens.unshift(row);
    this.pushTimeline('FRAUD_LIEN', `${row.outcome}: ${row.note}`, {
      caseId: row.caseId,
    });
    return row;
  }

  /**
   * Core policy: attempt a proportionate hold for a case against a specific account.
   * This is where cash-out and good-faith merchant exits become first-class outcomes —
   * not silent failures.
   */
  attemptLien(input: {
    caseId: string;
    accountRef: string;
    requestedAmount?: number;
    allowWholeAccount?: boolean;
  }): LienAction {
    const c = this.cases.get(input.caseId);
    if (!c) throw new Error('Case not found');
    if (!c.caseRef || !c.legalProvision) {
      return this.writeLien({
        caseId: c.id,
        accountRef: input.accountRef,
        requestedAmount: input.requestedAmount || c.amountLost,
        heldAmount: 0,
        outcome: 'REJECTED_NO_CASE_FIELDS',
        caseRef: c.caseRef,
        legalProvision: c.legalProvision,
        victimShare: 0,
        note: 'Hold rejected — caseRef and legalProvision required',
      });
    }

    const requested = input.requestedAmount ?? c.amountLost;
    if (input.allowWholeAccount) {
      return this.writeLien({
        caseId: c.id,
        accountRef: input.accountRef,
        requestedAmount: requested,
        heldAmount: 0,
        outcome: 'REJECTED_WHOLE_ACCOUNT',
        caseRef: c.caseRef,
        legalProvision: c.legalProvision,
        victimShare: 0,
        note: 'Whole-account freeze rejected — High Court / CFCFRMS direction: lien disputed amount only',
      });
    }

    const acct = this.getAccount(input.accountRef);

    // Good-faith merchant: do not auto-hold Raju unless investigator marked suspect.
    if (acct.role === 'MERCHANT' && !acct.suspectMerchant) {
      const purchaseHop = this.hops.find(
        (h) =>
          h.caseId === c.id &&
          h.toAccountRef === acct.accountRef &&
          h.kind === 'MERCHANT_PURCHASE' &&
          h.merchantGoodFaith,
      );
      if (purchaseHop) {
        c.status = 'TRAIL_EXHAUSTED';
        c.note = 'Trail ends in good-faith commerce — no automatic clawback from shopkeeper';
        c.updatedAt = nowIso();
        this.recoveryExplainer =
          'When stolen money pays a real shop for real goods, recovery usually dies there: the kirana is not a mule. That honest exit is a big reason the national restore rate stays near ~2%.';
        return this.writeLien({
          caseId: c.id,
          accountRef: acct.accountRef,
          requestedAmount: requested,
          heldAmount: 0,
          outcome: 'GOOD_FAITH_EXIT',
          caseRef: c.caseRef,
          legalProvision: c.legalProvision,
          victimShare: 0,
          relatedHopId: purchaseHop.id,
          note: `No hold on ${acct.label} — good-faith purchase for value (${purchaseHop.merchantName || 'merchant'}). Pursue fraudster, not the shop.`,
        });
      }
      return this.writeLien({
        caseId: c.id,
        accountRef: acct.accountRef,
        requestedAmount: requested,
        heldAmount: 0,
        outcome: 'REJECTED_GOOD_FAITH_MERCHANT',
        caseRef: c.caseRef,
        legalProvision: c.legalProvision,
        victimShare: 0,
        note: `Merchant account ${acct.label} protected unless marked suspectMerchant`,
      });
    }

    // Cash / crypto exits from this account?
    const exitHop = this.hops.find(
      (h) =>
        h.caseId === c.id &&
        h.fromAccountRef === acct.accountRef &&
        (h.kind === 'ATM_CASHOUT' || h.kind === 'AEPS_CASHOUT' || h.kind === 'CRYPTO_EXIT'),
    );
    if (exitHop && acct.availableBalance <= 0) {
      acct.preventFurtherCredit = acct.layer === 1 ? true : acct.preventFurtherCredit;
      acct.updatedAt = nowIso();
      c.status = 'TRAIL_EXHAUSTED';
      c.note = `Funds left banking system via ${exitHop.kind}`;
      c.updatedAt = nowIso();
      this.recoveryExplainer =
        'If the fraudster cashes out (ATM/AePS) or crypto-exits before the lien lands, ClearChain cannot invent the rupees back. We record OUTFLOWED + evidence for LEA, and on Layer-1 we can PREVENT_FURTHER_CREDIT so the mule is not reused — that is prevention, not victim refund. This timing gap is why ~2% is restored.';
      const outflow = this.writeLien({
        caseId: c.id,
        accountRef: acct.accountRef,
        requestedAmount: requested,
        heldAmount: 0,
        outcome: 'OUTFLOWED',
        caseRef: c.caseRef,
        legalProvision: c.legalProvision,
        victimShare: 0,
        relatedHopId: exitHop.id,
        note: `₹${exitHop.amount} already left via ${exitHop.kind}${exitHop.evidenceRef ? ` (${exitHop.evidenceRef})` : ''}. Lien recovery unavailable.`,
      });
      if (acct.layer === 1) {
        this.writeLien({
          caseId: c.id,
          accountRef: acct.accountRef,
          requestedAmount: 0,
          heldAmount: 0,
          outcome: 'PREVENT_FURTHER_CREDIT',
          caseRef: c.caseRef,
          legalProvision: c.legalProvision,
          victimShare: 0,
          relatedHopId: exitHop.id,
          note: 'Layer-1 empty — PREVENT_FURTHER_CREDIT marked so future crime credits are blocked (CFCFRMS-aligned SOP).',
        });
      }
      return outflow;
    }

    // Money moved to another bank account — follow the hop.
    const transferOut = this.hops.find(
      (h) =>
        h.caseId === c.id &&
        h.fromAccountRef === acct.accountRef &&
        h.kind === 'INTERNAL_TRANSFER' &&
        h.toAccountRef,
    );
    if (transferOut && acct.availableBalance <= 0) {
      c.note = `Layer balance empty — follow hop to ${transferOut.toAccountRef}`;
      c.updatedAt = nowIso();
      return this.writeLien({
        caseId: c.id,
        accountRef: acct.accountRef,
        requestedAmount: requested,
        heldAmount: 0,
        outcome: 'HOP_FOLLOW',
        caseRef: c.caseRef,
        legalProvision: c.legalProvision,
        victimShare: 0,
        relatedHopId: transferOut.id,
        note: `No balance at ${acct.label}. Next: attempt lien on ${transferOut.toAccountRef} (RRN ${transferOut.rrn}).`,
      });
    }

    // Merchant purchase exit from mule (balance already moved to merchant account in recordHop).
    const merchantExit = this.hops.find(
      (h) =>
        h.caseId === c.id &&
        h.fromAccountRef === acct.accountRef &&
        h.kind === 'MERCHANT_PURCHASE',
    );
    if (merchantExit && acct.availableBalance <= 0 && acct.role !== 'MERCHANT') {
      c.status = 'TRAIL_EXHAUSTED';
      c.updatedAt = nowIso();
      if (merchantExit.merchantGoodFaith) {
        this.recoveryExplainer =
          'Stolen funds spent at a legit shop exit the recoverable trail. ClearChain traces the hop but refuses to punish the shopkeeper by default — another structural reason restore rates stay tiny.';
        return this.writeLien({
          caseId: c.id,
          accountRef: acct.accountRef,
          requestedAmount: requested,
          heldAmount: 0,
          outcome: 'GOOD_FAITH_EXIT',
          caseRef: c.caseRef,
          legalProvision: c.legalProvision,
          victimShare: 0,
          relatedHopId: merchantExit.id,
          note: `Mule empty — ₹${merchantExit.amount} paid to good-faith merchant ${merchantExit.merchantName || merchantExit.toAccountRef}. No lien on mule; merchant protected unless suspect.`,
        });
      }
    }

    // Funds still here — proportionate / pro-rata with other active liens on same account.
    const alreadyHeld = this.liens
      .filter(
        (l) =>
          l.accountRef === acct.accountRef &&
          (l.outcome === 'LIEN_ACTIVE' ||
            l.outcome === 'PARTIAL_LIEN' ||
            l.outcome === 'PRO_RATA_LIEN'),
      )
      .reduce((s, l) => s + l.heldAmount, 0);
    const lienable = Math.max(0, +(acct.availableBalance - alreadyHeld).toFixed(2));

    if (lienable <= 0) {
      c.status = 'TRAIL_EXHAUSTED';
      c.updatedAt = nowIso();
      return this.writeLien({
        caseId: c.id,
        accountRef: acct.accountRef,
        requestedAmount: requested,
        heldAmount: 0,
        outcome: 'OUTFLOWED',
        caseRef: c.caseRef,
        legalProvision: c.legalProvision,
        victimShare: 0,
        note: `Nothing left to hold at ${acct.label} (balance ${acct.availableBalance}, already liened ${alreadyHeld}).`,
      });
    }

    // Multi-victim: other cases touching this account that do not yet have a hold share the remaining pot.
    const alreadyHeldCaseIds = new Set(
      this.liens
        .filter(
          (l) =>
            l.accountRef === acct.accountRef &&
            l.heldAmount > 0 &&
            (l.outcome === 'LIEN_ACTIVE' ||
              l.outcome === 'PARTIAL_LIEN' ||
              l.outcome === 'PRO_RATA_LIEN'),
        )
        .map((l) => l.caseId),
    );
    const competing = [...this.cases.values()].filter(
      (x) =>
        x.id !== c.id &&
        !alreadyHeldCaseIds.has(x.id) &&
        (x.entryAccountRef === acct.accountRef ||
          this.hops.some(
            (h) =>
              h.caseId === x.id &&
              (h.toAccountRef === acct.accountRef || h.fromAccountRef === acct.accountRef),
          )) &&
        x.status !== 'CLOSED' &&
        x.status !== 'TRAIL_EXHAUSTED',
    );

    let holdAmt = Math.min(requested, lienable);
    let outcome: LienOutcomeStatus = holdAmt < requested ? 'PARTIAL_LIEN' : 'LIEN_ACTIVE';
    let note = `Proportionate lien ₹${holdAmt} on ${acct.label} (requested ₹${requested}, available ₹${lienable}). Rest of account stays usable.`;

    const potShared =
      competing.length > 0 ||
      [...this.cases.values()].some(
        (x) =>
          x.id !== c.id &&
          x.entryAccountRef === acct.accountRef &&
          x.status !== 'CLOSED',
      );

    if (competing.length > 0) {
      const unpaidClaimants = [c, ...competing];
      const totalClaim = unpaidClaimants.reduce((s, x) => s + x.amountLost, 0);
      holdAmt = +((lienable * c.amountLost) / totalClaim).toFixed(2);
      holdAmt = Math.min(holdAmt, lienable, requested);
      outcome = 'PRO_RATA_LIEN';
      note = `Pro-rata lien ₹${holdAmt} for ${c.victimName} from pot ₹${lienable} across ${unpaidClaimants.length} victims (total claims ₹${totalClaim}). This is why one mule freeze rarely makes every victim whole.`;
      this.recoveryExplainer =
        'Even when money is frozen, many victims often share one small pot. Courts/banks split what’s left. Partial recovery is common; full restore is rare — another driver of the ~2% figure.';
    } else if (potShared) {
      holdAmt = Math.min(requested, lienable);
      outcome = 'PRO_RATA_LIEN';
      note = `Pro-rata remainder ₹${holdAmt} for ${c.victimName} from leftover pot ₹${lienable} after other victims’ liens. Nobody is made fully whole.`;
      this.recoveryExplainer =
        'Even when money is frozen, many victims often share one small pot. Courts/banks split what’s left. Partial recovery is common; full restore is rare — another driver of the ~2% figure.';
    }

    // Do not debit availableBalance here — lienable already = balance − existing liens.
    // Debiting both would double-count and break multi-victim pro-rata.
    acct.updatedAt = nowIso();
    c.status = 'PARTIALLY_RECOVERABLE';
    if (holdAmt >= c.amountLost) {
      c.note = `Full disputed amount under lien at ${acct.label} — refund still needs court/LEA path (lien ≠ auto-refund)`;
    } else {
      c.note = `Only ₹${holdAmt} of ₹${c.amountLost} under lien — shortfall remains`;
    }
    c.updatedAt = nowIso();

    if (!competing.length) {
      this.recoveryExplainer =
        'Best case: funds still sitting in a mule account → proportionate lien. Even then the victim waits on police/court to actually receive money. Lien marked ≫ money restored — that gap alone keeps national restore rates near ~2%.';
    }

    return this.writeLien({
      caseId: c.id,
      accountRef: acct.accountRef,
      requestedAmount: requested,
      heldAmount: holdAmt,
      outcome,
      caseRef: c.caseRef,
      legalProvision: c.legalProvision,
      victimShare: holdAmt,
      note,
    });
  }

  /** Follow HOP_FOLLOW automatically one step (demo helper). */
  attemptLienFollowHop(caseId: string): LienAction {
    const last = this.liens.find((l) => l.caseId === caseId && l.outcome === 'HOP_FOLLOW');
    if (!last?.relatedHopId) throw new Error('No HOP_FOLLOW pending for case');
    const hop = this.hops.find((h) => h.id === last.relatedHopId);
    if (!hop?.toAccountRef) throw new Error('Hop has no destination');
    return this.attemptLien({ caseId, accountRef: hop.toAccountRef });
  }

  markSuspectMerchant(accountRef: string, suspect: boolean): TrailAccount {
    const a = this.getAccount(accountRef);
    a.suspectMerchant = suspect;
    a.updatedAt = nowIso();
    this.pushTimeline(
      'FRAUD_FLAG',
      `${a.label} suspectMerchant=${suspect}`,
    );
    return a;
  }

  /* ---------- One-click scenarios (full narrative power) ---------- */

  scenarioFundsStillThere(): { case: FraudCase; lien: LienAction } {
    this.seedMule('ACC-MULE-1', 'BANK_B', 'Layer-1 mule', 1, 0);
    const c = this.openCase({
      caseRef: 'NCRP-STILL-100',
      legalProvision: 'BNSS / CFCFRMS lien',
      victimName: 'Priya',
      amountLost: 100,
      entryAccountRef: 'ACC-MULE-1',
      entryRrn: 'RRN-FRAUD-IN-1',
    });
    this.recordHop({
      caseId: c.id,
      fromAccountRef: null,
      toAccountRef: 'ACC-MULE-1',
      rrn: 'RRN-FRAUD-IN-1',
      amount: 100,
      kind: 'FRAUD_CREDIT',
      note: 'Victim → mule Layer-1 credit ₹100 (still sitting when case lands)',
    });
    return { case: c, lien: this.attemptLien({ caseId: c.id, accountRef: 'ACC-MULE-1' }) };
  }

  scenarioCashedOutBeforeFreeze(): { case: FraudCase; liens: LienAction[] } {
    this.upsertAccount({
      accountRef: 'ACC-MULE-ATM',
      bankId: 'BANK_B',
      label: 'Layer-1 mule (ATM exit)',
      role: 'MULE',
      layer: 1,
      availableBalance: 0,
      preventFurtherCredit: false,
      suspectMerchant: false,
    });
    const c = this.openCase({
      caseRef: 'NCRP-ATM-100',
      legalProvision: 'BNSS / CFCFRMS lien',
      victimName: 'Amit',
      amountLost: 100,
      entryAccountRef: 'ACC-MULE-ATM',
      entryRrn: 'RRN-FRAUD-ATM-IN',
    });
    this.recordHop({
      caseId: c.id,
      fromAccountRef: null,
      toAccountRef: 'ACC-MULE-ATM',
      rrn: 'RRN-FRAUD-ATM-IN',
      amount: 100,
      kind: 'FRAUD_CREDIT',
      note: 'Fraud credit lands in mule',
    });
    this.recordHop({
      caseId: c.id,
      fromAccountRef: 'ACC-MULE-ATM',
      toAccountRef: null,
      rrn: 'RRN-ATM-OUT',
      amount: 100,
      kind: 'ATM_CASHOUT',
      evidenceRef: 'ATM-ID-88421',
      note: 'Fraudster withdrew ₹100 at ATM before complaint/lien',
    });
    const outflow = this.attemptLien({ caseId: c.id, accountRef: 'ACC-MULE-ATM' });
    const prevent = this.liens.find(
      (l) => l.caseId === c.id && l.outcome === 'PREVENT_FURTHER_CREDIT',
    );
    return { case: c, liens: prevent ? [outflow, prevent] : [outflow] };
  }

  scenarioHopLayer2(): { case: FraudCase; first: LienAction; second: LienAction } {
    this.upsertAccount({
      accountRef: 'ACC-L1',
      bankId: 'BANK_B',
      label: 'Layer-1 mule',
      role: 'MULE',
      layer: 1,
      availableBalance: 0,
      preventFurtherCredit: false,
      suspectMerchant: false,
    });
    this.upsertAccount({
      accountRef: 'ACC-L2',
      bankId: 'BANK_A',
      label: 'Layer-2 mule',
      role: 'MULE',
      layer: 2,
      availableBalance: 0,
      preventFurtherCredit: false,
      suspectMerchant: false,
    });
    const c = this.openCase({
      caseRef: 'NCRP-HOP-100',
      legalProvision: 'BNSS / CFCFRMS lien',
      victimName: 'Neha',
      amountLost: 100,
      entryAccountRef: 'ACC-L1',
      entryRrn: 'RRN-L1-IN',
    });
    this.recordHop({
      caseId: c.id,
      fromAccountRef: null,
      toAccountRef: 'ACC-L1',
      rrn: 'RRN-L1-IN',
      amount: 100,
      kind: 'FRAUD_CREDIT',
      note: 'Credit Layer-1',
    });
    this.recordHop({
      caseId: c.id,
      fromAccountRef: 'ACC-L1',
      toAccountRef: 'ACC-L2',
      rrn: 'RRN-L1-L2',
      amount: 100,
      kind: 'INTERNAL_TRANSFER',
      note: 'Layer-1 → Layer-2 hop (money faster than alert)',
    });
    const first = this.attemptLien({ caseId: c.id, accountRef: 'ACC-L1' });
    const second = this.attemptLienFollowHop(c.id);
    return { case: c, first, second };
  }

  scenarioGoodFaithShopkeeper(): { case: FraudCase; muleLien: LienAction; shopLien: LienAction } {
    this.upsertAccount({
      accountRef: 'ACC-MULE-SHOP',
      bankId: 'BANK_B',
      label: 'Layer-1 mule',
      role: 'MULE',
      layer: 1,
      availableBalance: 0,
      preventFurtherCredit: false,
      suspectMerchant: false,
    });
    this.upsertAccount({
      accountRef: 'ACC-RAJU-SHOP',
      bankId: 'BANK_A',
      label: 'Raju Electronics (shopkeeper)',
      role: 'MERCHANT',
      layer: 0,
      availableBalance: 0,
      preventFurtherCredit: false,
      suspectMerchant: false,
    });
    const c = this.openCase({
      caseRef: 'NCRP-SHOP-100',
      legalProvision: 'BNSS / CFCFRMS lien',
      victimName: 'Karan',
      amountLost: 100,
      entryAccountRef: 'ACC-MULE-SHOP',
      entryRrn: 'RRN-SHOP-IN',
    });
    this.recordHop({
      caseId: c.id,
      fromAccountRef: null,
      toAccountRef: 'ACC-MULE-SHOP',
      rrn: 'RRN-SHOP-IN',
      amount: 100,
      kind: 'FRAUD_CREDIT',
      note: 'Fraud credit to mule',
    });
    this.recordHop({
      caseId: c.id,
      fromAccountRef: 'ACC-MULE-SHOP',
      toAccountRef: 'ACC-RAJU-SHOP',
      rrn: 'RRN-UPI-REPAIR',
      amount: 100,
      kind: 'MERCHANT_PURCHASE',
      merchantGoodFaith: true,
      merchantName: 'Raju Electronics — phone repair',
      note: 'Fraudster paid Raju for a real repair (good-faith exit)',
    });
    const muleLien = this.attemptLien({ caseId: c.id, accountRef: 'ACC-MULE-SHOP' });
    const shopLien = this.attemptLien({ caseId: c.id, accountRef: 'ACC-RAJU-SHOP' });
    return { case: c, muleLien, shopLien };
  }

  scenarioSuspectMerchantOverride(): { case: FraudCase; lien: LienAction } {
    const prior = this.scenarioGoodFaithShopkeeper();
    this.markSuspectMerchant('ACC-RAJU-SHOP', true);
    // Put balance back on shop for hold demo (simulating unsettled credit still there)
    this.getAccount('ACC-RAJU-SHOP').availableBalance = 100;
    const lien = this.attemptLien({
      caseId: prior.case.id,
      accountRef: 'ACC-RAJU-SHOP',
      requestedAmount: 100,
    });
    this.recoveryExplainer =
      'Only if the investigator marks the merchant as suspect (fake shop / mule merchant) does ClearChain allow a proportionate hold on that account — still not a whole-account freeze.';
    return { case: prior.case, lien };
  }

  scenarioMultiVictimProRata(): { cases: FraudCase[]; liens: LienAction[] } {
    this.upsertAccount({
      accountRef: 'ACC-POT',
      bankId: 'BANK_B',
      label: 'Shared mule pot',
      role: 'MULE',
      layer: 1,
      availableBalance: 0,
      preventFurtherCredit: false,
      suspectMerchant: false,
    });
    const c1 = this.openCase({
      caseRef: 'NCRP-V1-100',
      legalProvision: 'BNSS / CFCFRMS lien',
      victimName: 'Victim A',
      amountLost: 100,
      entryAccountRef: 'ACC-POT',
      entryRrn: 'RRN-V1',
    });
    const c2 = this.openCase({
      caseRef: 'NCRP-V2-100',
      legalProvision: 'BNSS / CFCFRMS lien',
      victimName: 'Victim B',
      amountLost: 100,
      entryAccountRef: 'ACC-POT',
      entryRrn: 'RRN-V2',
    });
    this.recordHop({
      caseId: c1.id,
      fromAccountRef: null,
      toAccountRef: 'ACC-POT',
      rrn: 'RRN-V1',
      amount: 100,
      kind: 'FRAUD_CREDIT',
      note: 'Victim A loss into shared pot',
    });
    this.recordHop({
      caseId: c2.id,
      fromAccountRef: null,
      toAccountRef: 'ACC-POT',
      rrn: 'RRN-V2',
      amount: 100,
      kind: 'FRAUD_CREDIT',
      note: 'Victim B loss into shared pot',
    });
    // Only ₹150 left when cases land (₹50 already spent elsewhere)
    this.getAccount('ACC-POT').availableBalance = 150;
    const l1 = this.attemptLien({ caseId: c1.id, accountRef: 'ACC-POT' });
    const l2 = this.attemptLien({ caseId: c2.id, accountRef: 'ACC-POT' });
    return { cases: [c1, c2], liens: [l1, l2] };
  }

  scenarioWholeAccountRejected(): LienAction {
    this.upsertAccount({
      accountRef: 'ACC-INNOCENT',
      bankId: 'BANK_A',
      label: 'Innocent salary account',
      role: 'UNKNOWN',
      layer: 2,
      availableBalance: 50000,
      preventFurtherCredit: false,
      suspectMerchant: false,
    });
    const c = this.openCase({
      caseRef: 'NCRP-WHOLE-1',
      legalProvision: 'BNSS',
      victimName: 'Reporter',
      amountLost: 500,
      entryAccountRef: 'ACC-INNOCENT',
      entryRrn: 'RRN-SMALL',
    });
    return this.attemptLien({
      caseId: c.id,
      accountRef: 'ACC-INNOCENT',
      requestedAmount: 500,
      allowWholeAccount: true,
    });
  }

  private seedMule(
    ref: string,
    bankId: string,
    label: string,
    layer: number,
    balance: number,
  ) {
    this.upsertAccount({
      accountRef: ref,
      bankId,
      label,
      role: 'MULE',
      layer,
      availableBalance: balance,
      preventFurtherCredit: false,
      suspectMerchant: false,
    });
  }

  snapshot(): FraudTrailSnapshot {
    return {
      cases: [...this.cases.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      accounts: [...this.accounts.values()],
      hops: this.hops,
      liens: this.liens,
      recoveryExplainer: this.recoveryExplainer,
    };
  }
}
