const BASE = '';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || res.statusText);
  }
  return data as T;
}

export type Snapshot = {
  mode: string;
  banks: Array<{ bankId: string; status: string; updatedAt: string; reason: string }>;
  payments: Array<{
    rrn: string;
    merchantName: string;
    payeeBankId: string;
    amount: number;
    fee: number;
    gst: number;
    status: string;
    escrowConfirmed: boolean;
    floatAdvanced: boolean;
    createdAt: string;
    updatedAt: string;
    deadlineAt: string;
    note: string;
  }>;
  float: { id: string; balance: number; updatedAt: string };
  obligations: Array<{
    id: string;
    fromTier: string;
    toTier: string;
    amount: number;
    consented: boolean;
    paid: boolean;
    anchorRrn: string;
    udyam: string;
    dueDate: string;
  }>;
  holds: Array<{
    id: string;
    accountRef: string;
    amount: number;
    caseRef: string;
    legalProvision: string;
    status: string;
  }>;
  timeline: Array<{ at: string; kind: string; message: string; rrn?: string }>;
  demoTatMs: number;
};

export const api = {
  snapshot: () => req<Snapshot>('/api/snapshot'),
  health: () => req<{ status: string; mode: string; demoTatMs: number }>('/api/health'),
  setBankHealth: (bankId: string, status: string, reason: string) =>
    req(`/api/banks/${bankId}/health`, {
      method: 'POST',
      body: JSON.stringify({ status, reason }),
    }),
  payRaju: (rrn?: string, amount?: number) =>
    req<{ payment: Snapshot['payments'][0] }>('/api/demo/pay-raju', {
      method: 'POST',
      body: JSON.stringify({ rrn, amount }),
    }),
  attempt: (body: Record<string, unknown>) =>
    req('/api/payments/attempt', { method: 'POST', body: JSON.stringify(body) }),
  confirm: (rrn: string) =>
    req(`/api/payments/${rrn}/confirm-and-advance`, { method: 'POST', body: '{}' }),
  markStuck: (rrn: string) =>
    req(`/api/payments/${rrn}/mark-stuck`, { method: 'POST', body: '{}' }),
  runWatcher: () =>
    req<{ reversedCount: number }>('/api/watcher/run', { method: 'POST', body: '{}' }),
  registerObligation: (body: Record<string, unknown>) =>
    req('/api/obligations', { method: 'POST', body: JSON.stringify(body) }),
  cascade: (id: string, anchorRrn: string) =>
    req(`/api/obligations/${id}/cascade`, {
      method: 'POST',
      body: JSON.stringify({ anchorRrn }),
    }),
  createHold: (body: Record<string, unknown>) =>
    req('/api/holds', { method: 'POST', body: JSON.stringify(body) }),
};
