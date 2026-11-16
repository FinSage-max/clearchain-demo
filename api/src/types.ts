export type BankStatus = 'HEALTHY' | 'DEGRADED' | 'PROBING';

export interface BankHealth {
  bankId: string;
  status: BankStatus;
  updatedAt: string;
  reason: string;
}

export type PaymentStatus =
  | 'PENDING_ESCROW'
  | 'PAID_INSTANT'
  | 'FAILED_BEFORE_DEBIT'
  | 'STUCK'
  | 'REVERSED';

export interface Payment {
  rrn: string;
  merchantId: string;
  merchantName: string;
  payeeBankId: string;
  amount: number;
  fee: number;
  gst: number;
  status: PaymentStatus;
  escrowConfirmed: boolean;
  floatAdvanced: boolean;
  createdAt: string;
  updatedAt: string;
  deadlineAt: string;
  note: string;
}

export interface FloatAccount {
  id: string;
  balance: number;
  updatedAt: string;
}

export interface Obligation {
  id: string;
  fromTier: string;
  toTier: string;
  amount: number;
  invoiceRef: string;
  udyam: string;
  dueDate: string;
  consented: boolean;
  paid: boolean;
  anchorRrn: string;
}

/** Legacy simple hold kept for backward-compatible API. */
export interface FraudHold {
  id: string;
  accountRef: string;
  amount: number;
  caseRef: string;
  legalProvision: string;
  victimShare: number;
  status: string;
  createdAt: string;
}

export interface TimelineEvent {
  at: string;
  kind: string;
  message: string;
  rrn?: string;
  caseId?: string;
}

/* ---------- Fraud trail (full-power) ---------- */

export type AccountRole = 'MULE' | 'MERCHANT' | 'VICTIM' | 'UNKNOWN';

export type HopKind =
  | 'FRAUD_CREDIT'
  | 'INTERNAL_TRANSFER'
  | 'ATM_CASHOUT'
  | 'AEPS_CASHOUT'
  | 'CRYPTO_EXIT'
  | 'MERCHANT_PURCHASE';

export type LienOutcomeStatus =
  | 'LIEN_ACTIVE'
  | 'PARTIAL_LIEN'
  | 'HOP_FOLLOW'
  | 'OUTFLOWED'
  | 'GOOD_FAITH_EXIT'
  | 'PREVENT_FURTHER_CREDIT'
  | 'PRO_RATA_LIEN'
  | 'REJECTED_NO_CASE_FIELDS'
  | 'REJECTED_WHOLE_ACCOUNT'
  | 'REJECTED_GOOD_FAITH_MERCHANT';

export interface TrailAccount {
  accountRef: string;
  bankId: string;
  label: string;
  role: AccountRole;
  layer: number;
  /** Balance still in the banking system at this node (demo world-state). */
  availableBalance: number;
  /** First-layer empty-account SOP: block future crime credits. */
  preventFurtherCredit: boolean;
  /** Investigator may override good-faith protection if merchant is suspect. */
  suspectMerchant: boolean;
  updatedAt: string;
}

export interface FraudCase {
  id: string;
  caseRef: string;
  legalProvision: string;
  victimName: string;
  amountLost: number;
  /** First credit into the mule / Layer-1. */
  entryAccountRef: string;
  entryRrn: string;
  status: 'OPEN' | 'PARTIALLY_RECOVERABLE' | 'TRAIL_EXHAUSTED' | 'CLOSED';
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface FraudHop {
  id: string;
  caseId: string;
  fromAccountRef: string | null;
  toAccountRef: string | null;
  rrn: string;
  amount: number;
  kind: HopKind;
  /** True when MERCHANT_PURCHASE looks like real goods/services for value. */
  merchantGoodFaith: boolean;
  merchantName?: string;
  evidenceRef?: string;
  at: string;
  note: string;
}

export interface LienAction {
  id: string;
  caseId: string;
  accountRef: string;
  requestedAmount: number;
  heldAmount: number;
  outcome: LienOutcomeStatus;
  caseRef: string;
  legalProvision: string;
  victimShare: number;
  relatedHopId?: string;
  note: string;
  createdAt: string;
}

export interface FraudTrailSnapshot {
  cases: FraudCase[];
  accounts: TrailAccount[];
  hops: FraudHop[];
  liens: LienAction[];
  /** Why ~2% lands — running explanation from last scenario. */
  recoveryExplainer: string;
}
