import cors from 'cors';
import express, { Request, Response } from 'express';
import { DEMO_TAT_MS, store } from './memoryStore';
import { BankStatus } from './types';

const app = express();
const port = Number(process.env.PORT || 4000);
const mode = process.env.DEMO_MODE || 'memory';

app.use(cors());
app.use(express.json());

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function requireMemory(_req: Request, res: Response): boolean {
  if (mode !== 'memory') {
    res.status(501).json({
      error: 'Fabric mode not wired in this build — use DEMO_MODE=memory tonight',
    });
    return false;
  }
  return true;
}

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    mode,
    demoTatMs: DEMO_TAT_MS,
    message:
      mode === 'memory'
        ? 'ClearChain running in-memory (tonight demo). Same rules as Go chaincode.'
        : 'Fabric mode selected but not configured yet.',
  });
});

app.get('/api/snapshot', (_req, res) => {
  if (!requireMemory(_req, res)) return;
  res.json(store.snapshot());
});

app.post('/api/banks/:bankId/health', (req, res) => {
  if (!requireMemory(req, res)) return;
  try {
    const status = String(req.body.status || '').toUpperCase() as BankStatus;
    const reason = String(req.body.reason || 'manual');
    if (!['HEALTHY', 'DEGRADED', 'PROBING'].includes(status)) {
      res.status(400).json({ error: 'status must be HEALTHY | DEGRADED | PROBING' });
      return;
    }
    res.json(store.setBankHealth(req.params.bankId, status, reason));
  } catch (e) {
    res.status(400).json({ error: errMsg(e) });
  }
});

app.post('/api/payments/attempt', (req, res) => {
  if (!requireMemory(req, res)) return;
  try {
    const {
      rrn,
      merchantId = 'MERCHANT_RAJU',
      merchantName = 'Raju Electronics',
      payeeBankId = 'BANK_A',
      amount = 2500,
      fee = 10,
      gst = 1.8,
      markStuck = false,
    } = req.body;

    if (!rrn) {
      res.status(400).json({ error: 'rrn is required' });
      return;
    }

    const payment = store.attemptPayment({
      rrn: String(rrn),
      merchantId: String(merchantId),
      merchantName: String(merchantName),
      payeeBankId: String(payeeBankId),
      amount: Number(amount),
      fee: Number(fee),
      gst: Number(gst),
      markStuck: Boolean(markStuck),
    });
    res.status(201).json(payment);
  } catch (e) {
    res.status(400).json({ error: errMsg(e) });
  }
});

app.post('/api/payments/:rrn/confirm-and-advance', (req, res) => {
  if (!requireMemory(req, res)) return;
  try {
    res.json(store.confirmEscrowAndAdvance(req.params.rrn));
  } catch (e) {
    res.status(400).json({ error: errMsg(e) });
  }
});

app.post('/api/payments/:rrn/mark-stuck', (req, res) => {
  if (!requireMemory(req, res)) return;
  try {
    res.json(store.markStuck(req.params.rrn));
  } catch (e) {
    res.status(400).json({ error: errMsg(e) });
  }
});

app.post('/api/payments/:rrn/reverse', (req, res) => {
  if (!requireMemory(req, res)) return;
  try {
    res.json(store.autoReverse(req.params.rrn));
  } catch (e) {
    res.status(400).json({ error: errMsg(e) });
  }
});

app.post('/api/watcher/run', (_req, res) => {
  if (!requireMemory(_req, res)) return;
  const reversed = store.runWatcher();
  res.json({ reversedCount: reversed.length, reversed });
});

app.get('/api/payments/:rrn', (req, res) => {
  if (!requireMemory(req, res)) return;
  const p = store.payments.get(req.params.rrn);
  if (!p) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.json(p);
});

app.post('/api/obligations', (req, res) => {
  if (!requireMemory(req, res)) return;
  try {
    const {
      id,
      fromTier,
      toTier,
      amount,
      invoiceRef,
      udyam,
      dueDate,
      consented,
    } = req.body;
    if (!id || !fromTier || !toTier || amount === undefined) {
      res.status(400).json({ error: 'id, fromTier, toTier, amount required' });
      return;
    }
    res.status(201).json(
      store.registerObligation({
        id: String(id),
        fromTier: String(fromTier),
        toTier: String(toTier),
        amount: Number(amount),
        invoiceRef: String(invoiceRef || ''),
        udyam: String(udyam || ''),
        dueDate: String(dueDate || ''),
        consented: Boolean(consented),
      }),
    );
  } catch (e) {
    res.status(400).json({ error: errMsg(e) });
  }
});

app.post('/api/obligations/:id/cascade', (req, res) => {
  if (!requireMemory(req, res)) return;
  try {
    const anchorRrn = String(req.body.anchorRrn || '');
    if (!anchorRrn) {
      res.status(400).json({ error: 'anchorRrn required' });
      return;
    }
    res.json(store.cascadePay(req.params.id, anchorRrn));
  } catch (e) {
    res.status(400).json({ error: errMsg(e) });
  }
});

app.post('/api/holds', (req, res) => {
  if (!requireMemory(req, res)) return;
  try {
    const { id, accountRef, amount, caseRef, legalProvision, victimShare } = req.body;
    if (!id || !accountRef || amount === undefined) {
      res.status(400).json({ error: 'id, accountRef, amount required' });
      return;
    }
    res.status(201).json(
      store.createHold({
        id: String(id),
        accountRef: String(accountRef),
        amount: Number(amount),
        caseRef: String(caseRef || ''),
        legalProvision: String(legalProvision || ''),
        victimShare: Number(victimShare || amount),
      }),
    );
  } catch (e) {
    res.status(400).json({ error: errMsg(e) });
  }
});

/** Demo helper: full happy path in one call */
app.post('/api/demo/pay-raju', (req, res) => {
  if (!requireMemory(req, res)) return;
  try {
    const rrn =
      String(req.body.rrn || '') ||
      `RRN${Date.now().toString().slice(-10)}`;
    const amount = Number(req.body.amount || 2500);
    const payment = store.attemptPayment({
      rrn,
      merchantId: 'MERCHANT_RAJU',
      merchantName: 'Raju Electronics',
      payeeBankId: 'BANK_A',
      amount,
      fee: 10,
      gst: 1.8,
    });
    if (payment.status === 'FAILED_BEFORE_DEBIT') {
      res.status(201).json({ payment, advanced: null });
      return;
    }
    const advanced = store.confirmEscrowAndAdvance(rrn);
    res.status(201).json({ payment: advanced, advanced });
  } catch (e) {
    res.status(400).json({ error: errMsg(e) });
  }
});

setInterval(() => {
  try {
    store.runWatcher();
  } catch {
    /* ignore */
  }
}, 3000);

app.listen(port, () => {
  console.log(`ClearChain API on http://localhost:${port} (mode=${mode}, TAT=${DEMO_TAT_MS}ms)`);
});
