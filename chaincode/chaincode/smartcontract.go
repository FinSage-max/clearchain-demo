/*
SPDX-License-Identifier: Apache-2.0

ClearChain — Payment Certainty contracts for Drunix / Fabric.
Tonight the API mirrors these rules in DEMO_MODE=memory.
*/

package chaincode

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

type SmartContract struct {
	contractapi.Contract
}

type BankHealth struct {
	BankID    string `json:"bankId"`
	Status    string `json:"status"` // HEALTHY | DEGRADED | PROBING
	UpdatedAt string `json:"updatedAt"`
	Reason    string `json:"reason"`
}

type Payment struct {
	RRN            string  `json:"rrn"`
	MerchantID     string  `json:"merchantId"`
	MerchantName   string  `json:"merchantName"`
	PayeeBankID    string  `json:"payeeBankId"`
	Amount         float64 `json:"amount"`
	Fee            float64 `json:"fee"`
	GST            float64 `json:"gst"`
	Status         string  `json:"status"`
	EscrowConfirmed bool   `json:"escrowConfirmed"`
	FloatAdvanced  bool    `json:"floatAdvanced"`
	CreatedAt      string  `json:"createdAt"`
	UpdatedAt      string  `json:"updatedAt"`
	DeadlineAt     string  `json:"deadlineAt"`
	Note           string  `json:"note"`
}

type FloatAccount struct {
	ID        string  `json:"id"`
	Balance   float64 `json:"balance"`
	UpdatedAt string  `json:"updatedAt"`
}

type Obligation struct {
	ID           string  `json:"id"`
	FromTier     string  `json:"fromTier"`
	ToTier       string  `json:"toTier"`
	Amount       float64 `json:"amount"`
	InvoiceRef   string  `json:"invoiceRef"`
	Udyam        string  `json:"udyam"`
	DueDate      string  `json:"dueDate"`
	Consented    bool    `json:"consented"`
	Paid         bool    `json:"paid"`
	AnchorRRN    string  `json:"anchorRrn"`
}

type FraudHold struct {
	ID             string  `json:"id"`
	AccountRef     string  `json:"accountRef"`
	Amount         float64 `json:"amount"`
	CaseRef        string  `json:"caseRef"`
	LegalProvision string  `json:"legalProvision"`
	VictimShare    float64 `json:"victimShare"`
	Status         string  `json:"status"`
	CreatedAt      string  `json:"createdAt"`
}

func healthKey(bankID string) string   { return "HEALTH_" + bankID }
func paymentKey(rrn string) string     { return "PAY_" + rrn }
func floatKey() string                 { return "FLOAT_PA_MAIN" }
func obligationKey(id string) string   { return "OBL_" + id }
func holdKey(id string) string         { return "HOLD_" + id }

func (s *SmartContract) InitLedger(ctx contractapi.TransactionContextInterface) error {
	now := time.Now().UTC().Format(time.RFC3339)
	banks := []BankHealth{
		{BankID: "BANK_A", Status: "HEALTHY", UpdatedAt: now, Reason: "seed"},
		{BankID: "BANK_B", Status: "HEALTHY", UpdatedAt: now, Reason: "seed"},
	}
	for _, b := range banks {
		bytes, _ := json.Marshal(b)
		if err := ctx.GetStub().PutState(healthKey(b.BankID), bytes); err != nil {
			return err
		}
	}
	fl := FloatAccount{ID: "PA_MAIN", Balance: 500000, UpdatedAt: now}
	bytes, _ := json.Marshal(fl)
	return ctx.GetStub().PutState(floatKey(), bytes)
}

func (s *SmartContract) SetBankHealth(ctx contractapi.TransactionContextInterface, bankID, status, reason, updatedAt string) error {
	if status != "HEALTHY" && status != "DEGRADED" && status != "PROBING" {
		return fmt.Errorf("invalid status %s", status)
	}
	b := BankHealth{BankID: bankID, Status: status, UpdatedAt: updatedAt, Reason: reason}
	bytes, err := json.Marshal(b)
	if err != nil {
		return err
	}
	return ctx.GetStub().PutState(healthKey(bankID), bytes)
}

func (s *SmartContract) GetBankHealth(ctx contractapi.TransactionContextInterface, bankID string) (*BankHealth, error) {
	bytes, err := ctx.GetStub().GetState(healthKey(bankID))
	if err != nil {
		return nil, err
	}
	if bytes == nil {
		return nil, fmt.Errorf("bank %s not found", bankID)
	}
	var b BankHealth
	if err := json.Unmarshal(bytes, &b); err != nil {
		return nil, err
	}
	return &b, nil
}

func (s *SmartContract) GetAllBankHealth(ctx contractapi.TransactionContextInterface) ([]*BankHealth, error) {
	iter, err := ctx.GetStub().GetStateByRange("HEALTH_", "HEALTH_~")
	if err != nil {
		return nil, err
	}
	defer iter.Close()
	var out []*BankHealth
	for iter.HasNext() {
		kv, err := iter.Next()
		if err != nil {
			return nil, err
		}
		var b BankHealth
		if err := json.Unmarshal(kv.Value, &b); err != nil {
			return nil, err
		}
		out = append(out, &b)
	}
	return out, nil
}

// AttemptPayment fails fast if payee bank is DEGRADED (before debit).
func (s *SmartContract) AttemptPayment(ctx contractapi.TransactionContextInterface, rrn, merchantID, merchantName, payeeBankID, amountStr, feeStr, gstStr, createdAt, deadlineAt string) (*Payment, error) {
	existing, err := ctx.GetStub().GetState(paymentKey(rrn))
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, fmt.Errorf("RRN %s already exists — duplicate rejected", rrn)
	}

	health, err := s.GetBankHealth(ctx, payeeBankID)
	if err != nil {
		return nil, err
	}
	if health.Status == "DEGRADED" {
		p := Payment{
			RRN: rrn, MerchantID: merchantID, MerchantName: merchantName, PayeeBankID: payeeBankID,
			Status: "FAILED_BEFORE_DEBIT", CreatedAt: createdAt, UpdatedAt: createdAt, DeadlineAt: deadlineAt,
			Note: "Payee bank DEGRADED — fail-fast, no debit",
		}
		var a, f, g float64
		fmt.Sscanf(amountStr, "%f", &a)
		fmt.Sscanf(feeStr, "%f", &f)
		fmt.Sscanf(gstStr, "%f", &g)
		p.Amount, p.Fee, p.GST = a, f, g
		bytes, _ := json.Marshal(p)
		_ = ctx.GetStub().PutState(paymentKey(rrn), bytes)
		return &p, nil
	}

	var amount, fee, gst float64
	fmt.Sscanf(amountStr, "%f", &amount)
	fmt.Sscanf(feeStr, "%f", &fee)
	fmt.Sscanf(gstStr, "%f", &gst)

	p := Payment{
		RRN: rrn, MerchantID: merchantID, MerchantName: merchantName, PayeeBankID: payeeBankID,
		Amount: amount, Fee: fee, GST: gst, Status: "PENDING_ESCROW",
		CreatedAt: createdAt, UpdatedAt: createdAt, DeadlineAt: deadlineAt,
		Note: "Payment accepted — awaiting escrow confirmation",
	}
	bytes, err := json.Marshal(p)
	if err != nil {
		return nil, err
	}
	if err := ctx.GetStub().PutState(paymentKey(rrn), bytes); err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *SmartContract) ConfirmEscrowAndAdvance(ctx contractapi.TransactionContextInterface, rrn, updatedAt string) (*Payment, error) {
	bytes, err := ctx.GetStub().GetState(paymentKey(rrn))
	if err != nil {
		return nil, err
	}
	if bytes == nil {
		return nil, fmt.Errorf("payment %s not found", rrn)
	}
	var p Payment
	if err := json.Unmarshal(bytes, &p); err != nil {
		return nil, err
	}
	if p.Status == "FAILED_BEFORE_DEBIT" {
		return nil, fmt.Errorf("cannot advance a failed-before-debit payment")
	}
	if p.FloatAdvanced {
		return nil, fmt.Errorf("RRN %s already advanced — duplicate rejected", rrn)
	}
	if p.Status != "PENDING_ESCROW" && p.Status != "STUCK" {
		return nil, fmt.Errorf("payment %s in status %s cannot be advanced", rrn, p.Status)
	}

	flBytes, err := ctx.GetStub().GetState(floatKey())
	if err != nil {
		return nil, err
	}
	var fl FloatAccount
	if err := json.Unmarshal(flBytes, &fl); err != nil {
		return nil, err
	}
	payout := p.Amount - p.Fee - p.GST
	if fl.Balance < payout {
		return nil, fmt.Errorf("insufficient float balance")
	}
	fl.Balance -= payout
	fl.UpdatedAt = updatedAt
	flOut, _ := json.Marshal(fl)
	if err := ctx.GetStub().PutState(floatKey(), flOut); err != nil {
		return nil, err
	}

	p.EscrowConfirmed = true
	p.FloatAdvanced = true
	p.Status = "PAID_INSTANT"
	p.UpdatedAt = updatedAt
	p.Note = "Escrow confirmed — float advance paid to merchant"
	out, _ := json.Marshal(p)
	if err := ctx.GetStub().PutState(paymentKey(rrn), out); err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *SmartContract) MarkStuck(ctx contractapi.TransactionContextInterface, rrn, updatedAt string) (*Payment, error) {
	bytes, err := ctx.GetStub().GetState(paymentKey(rrn))
	if err != nil || bytes == nil {
		return nil, fmt.Errorf("payment %s not found", rrn)
	}
	var p Payment
	_ = json.Unmarshal(bytes, &p)
	if p.FloatAdvanced {
		return nil, fmt.Errorf("already advanced — cannot mark stuck")
	}
	p.Status = "STUCK"
	p.UpdatedAt = updatedAt
	p.Note = "Ambiguous / unconfirmed — watcher eligible"
	out, _ := json.Marshal(p)
	_ = ctx.GetStub().PutState(paymentKey(rrn), out)
	return &p, nil
}

func (s *SmartContract) AutoReverse(ctx contractapi.TransactionContextInterface, rrn, updatedAt string) (*Payment, error) {
	bytes, err := ctx.GetStub().GetState(paymentKey(rrn))
	if err != nil || bytes == nil {
		return nil, fmt.Errorf("payment %s not found", rrn)
	}
	var p Payment
	_ = json.Unmarshal(bytes, &p)
	if p.FloatAdvanced {
		return nil, fmt.Errorf("float was advanced — reversal follows different liability path")
	}
	if p.Status == "REVERSED" {
		return &p, nil
	}
	p.Status = "REVERSED"
	p.UpdatedAt = updatedAt
	p.Note = "Watcher auto-reversal before/at TAT deadline — immutable record"
	out, _ := json.Marshal(p)
	_ = ctx.GetStub().PutState(paymentKey(rrn), out)
	return &p, nil
}

func (s *SmartContract) GetPayment(ctx contractapi.TransactionContextInterface, rrn string) (*Payment, error) {
	bytes, err := ctx.GetStub().GetState(paymentKey(rrn))
	if err != nil {
		return nil, err
	}
	if bytes == nil {
		return nil, fmt.Errorf("payment %s not found", rrn)
	}
	var p Payment
	if err := json.Unmarshal(bytes, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *SmartContract) GetAllPayments(ctx contractapi.TransactionContextInterface) ([]*Payment, error) {
	iter, err := ctx.GetStub().GetStateByRange("PAY_", "PAY_~")
	if err != nil {
		return nil, err
	}
	defer iter.Close()
	var out []*Payment
	for iter.HasNext() {
		kv, err := iter.Next()
		if err != nil {
			return nil, err
		}
		var p Payment
		_ = json.Unmarshal(kv.Value, &p)
		out = append(out, &p)
	}
	return out, nil
}

func (s *SmartContract) GetFloat(ctx contractapi.TransactionContextInterface) (*FloatAccount, error) {
	bytes, err := ctx.GetStub().GetState(floatKey())
	if err != nil || bytes == nil {
		return nil, fmt.Errorf("float not found")
	}
	var fl FloatAccount
	_ = json.Unmarshal(bytes, &fl)
	return &fl, nil
}

func (s *SmartContract) RegisterObligation(ctx contractapi.TransactionContextInterface, id, fromTier, toTier, amountStr, invoiceRef, udyam, dueDate string, consented string) error {
	if consented != "true" {
		return fmt.Errorf("obligation rejected — upstream tier consent required")
	}
	var amount float64
	fmt.Sscanf(amountStr, "%f", &amount)
	o := Obligation{
		ID: id, FromTier: fromTier, ToTier: toTier, Amount: amount,
		InvoiceRef: invoiceRef, Udyam: udyam, DueDate: dueDate, Consented: true,
	}
	bytes, _ := json.Marshal(o)
	return ctx.GetStub().PutState(obligationKey(id), bytes)
}

func (s *SmartContract) CascadePay(ctx contractapi.TransactionContextInterface, obligationID, anchorRRN, updatedAt string) (*Obligation, error) {
	bytes, err := ctx.GetStub().GetState(obligationKey(obligationID))
	if err != nil || bytes == nil {
		return nil, fmt.Errorf("obligation not found")
	}
	var o Obligation
	_ = json.Unmarshal(bytes, &o)
	if !o.Consented {
		return nil, fmt.Errorf("no consent")
	}
	o.Paid = true
	o.AnchorRRN = anchorRRN
	out, _ := json.Marshal(o)
	_ = ctx.GetStub().PutState(obligationKey(obligationID), out)
	return &o, nil
}

func (s *SmartContract) CreateFraudHold(ctx contractapi.TransactionContextInterface, id, accountRef, amountStr, caseRef, legalProvision, victimShareStr, createdAt string) (*FraudHold, error) {
	if caseRef == "" || legalProvision == "" {
		return nil, fmt.Errorf("hold rejected — caseRef and legalProvision required (no whole-account freeze)")
	}
	var amount, share float64
	fmt.Sscanf(amountStr, "%f", &amount)
	fmt.Sscanf(victimShareStr, "%f", &share)
	h := FraudHold{
		ID: id, AccountRef: accountRef, Amount: amount, CaseRef: caseRef,
		LegalProvision: legalProvision, VictimShare: share, Status: "ACTIVE", CreatedAt: createdAt,
	}
	bytes, _ := json.Marshal(h)
	if err := ctx.GetStub().PutState(holdKey(id), bytes); err != nil {
		return nil, err
	}
	return &h, nil
}
