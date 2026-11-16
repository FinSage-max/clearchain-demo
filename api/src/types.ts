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
}
