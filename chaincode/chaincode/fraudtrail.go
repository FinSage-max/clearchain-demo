/*
SPDX-License-Identifier: Apache-2.0

Fraud trail contracts — complements CFCFRMS.
Records hops and applies proportionate lien outcomes including
OUTFLOWED, GOOD_FAITH_EXIT, HOP_FOLLOW, PREVENT_FURTHER_CREDIT, PRO_RATA.
Tonight's API memory engine mirrors this policy; Fabric deploy is tomorrow.
*/

package chaincode

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

type TrailAccount struct {
	AccountRef           string  `json:"accountRef"`
	BankID               string  `json:"bankId"`
	Label                string  `json:"label"`
	Role                 string  `json:"role"`
	Layer                int     `json:"layer"`
	AvailableBalance     float64 `json:"availableBalance"`
	PreventFurtherCredit bool    `json:"preventFurtherCredit"`
	SuspectMerchant      bool    `json:"suspectMerchant"`
	UpdatedAt            string  `json:"updatedAt"`
}

type FraudCase struct {
	ID               string  `json:"id"`
	CaseRef          string  `json:"caseRef"`
	LegalProvision   string  `json:"legalProvision"`
	VictimName       string  `json:"victimName"`
	AmountLost       float64 `json:"amountLost"`
	EntryAccountRef  string  `json:"entryAccountRef"`
	EntryRRN         string  `json:"entryRrn"`
	Status           string  `json:"status"`
	Note             string  `json:"note"`
	CreatedAt        string  `json:"createdAt"`
	UpdatedAt        string  `json:"updatedAt"`
}

type FraudHop struct {
	ID                 string  `json:"id"`
	CaseID             string  `json:"caseId"`
	FromAccountRef     string  `json:"fromAccountRef"`
	ToAccountRef       string  `json:"toAccountRef"`
	RRN                string  `json:"rrn"`
	Amount             float64 `json:"amount"`
	Kind               string  `json:"kind"`
	MerchantGoodFaith  bool    `json:"merchantGoodFaith"`
	MerchantName       string  `json:"merchantName"`
	EvidenceRef        string  `json:"evidenceRef"`
	At                 string  `json:"at"`
	Note               string  `json:"note"`
}

type LienAction struct {
	ID               string  `json:"id"`
	CaseID           string  `json:"caseId"`
	AccountRef       string  `json:"accountRef"`
	RequestedAmount  float64 `json:"requestedAmount"`
	HeldAmount       float64 `json:"heldAmount"`
	Outcome          string  `json:"outcome"`
	CaseRef          string  `json:"caseRef"`
	LegalProvision   string  `json:"legalProvision"`
	VictimShare      float64 `json:"victimShare"`
	RelatedHopID     string  `json:"relatedHopId"`
	Note             string  `json:"note"`
	CreatedAt        string  `json:"createdAt"`
}

func trailAcctKey(ref string) string { return "TRACCT_" + ref }
func fraudCaseKey(id string) string  { return "FCASE_" + id }
func fraudHopKey(id string) string   { return "FHOP_" + id }
func lienKey(id string) string       { return "LIEN_" + id }

func (s *SmartContract) UpsertTrailAccount(ctx contractapi.TransactionContextInterface, accountRef, bankID, label, role, layerStr, balanceStr, preventStr, suspectStr, updatedAt string) error {
	var layer int
	var bal float64
	fmt.Sscanf(layerStr, "%d", &layer)
	fmt.Sscanf(balanceStr, "%f", &bal)
	a := TrailAccount{
		AccountRef: accountRef, BankID: bankID, Label: label, Role: role, Layer: layer,
		AvailableBalance: bal, PreventFurtherCredit: preventStr == "true", SuspectMerchant: suspectStr == "true",
		UpdatedAt: updatedAt,
	}
	bytes, err := json.Marshal(a)
	if err != nil {
		return err
	}
	return ctx.GetStub().PutState(trailAcctKey(accountRef), bytes)
}

func (s *SmartContract) OpenFraudCase(ctx contractapi.TransactionContextInterface, id, caseRef, legalProvision, victimName, amountStr, entryAccountRef, entryRRN, createdAt string) error {
	if caseRef == "" || legalProvision == "" {
		return fmt.Errorf("case rejected — caseRef and legalProvision required")
	}
	var amount float64
	fmt.Sscanf(amountStr, "%f", &amount)
	c := FraudCase{
		ID: id, CaseRef: caseRef, LegalProvision: legalProvision, VictimName: victimName,
		AmountLost: amount, EntryAccountRef: entryAccountRef, EntryRRN: entryRRN,
		Status: "OPEN", Note: "Complaint accepted", CreatedAt: createdAt, UpdatedAt: createdAt,
	}
	bytes, err := json.Marshal(c)
	if err != nil {
		return err
	}
	return ctx.GetStub().PutState(fraudCaseKey(id), bytes)
}

func (s *SmartContract) RecordFraudHop(ctx contractapi.TransactionContextInterface, id, caseID, fromRef, toRef, rrn, amountStr, kind, goodFaithStr, merchantName, evidenceRef, at, note string) error {
	var amount float64
	fmt.Sscanf(amountStr, "%f", &amount)
	h := FraudHop{
		ID: id, CaseID: caseID, FromAccountRef: fromRef, ToAccountRef: toRef, RRN: rrn,
		Amount: amount, Kind: kind, MerchantGoodFaith: goodFaithStr == "true",
		MerchantName: merchantName, EvidenceRef: evidenceRef, At: at, Note: note,
	}
	bytes, err := json.Marshal(h)
	if err != nil {
		return err
	}
	return ctx.GetStub().PutState(fraudHopKey(id), bytes)
}

// AttemptFraudLien encodes the critical policy outcomes for Fabric deploy.
// Full hop-balance simulation lives in the API memory engine for the tonight demo;
// this contract persists the decided outcome immutably with mandatory case fields.
func (s *SmartContract) AttemptFraudLien(ctx contractapi.TransactionContextInterface, id, caseID, accountRef, requestedStr, heldStr, outcome, caseRef, legalProvision, victimShareStr, relatedHopID, note, createdAt string) error {
	if caseRef == "" || legalProvision == "" {
		return fmt.Errorf("REJECTED_NO_CASE_FIELDS")
	}
	if outcome == "REJECTED_WHOLE_ACCOUNT" {
		// Explicitly allow recording a rejection of whole-account freeze.
	}
	if outcome == "" {
		return fmt.Errorf("outcome required")
	}
	var requested, held, share float64
	fmt.Sscanf(requestedStr, "%f", &requested)
	fmt.Sscanf(heldStr, "%f", &held)
	fmt.Sscanf(victimShareStr, "%f", &share)
	l := LienAction{
		ID: id, CaseID: caseID, AccountRef: accountRef, RequestedAmount: requested,
		HeldAmount: held, Outcome: outcome, CaseRef: caseRef, LegalProvision: legalProvision,
		VictimShare: share, RelatedHopID: relatedHopID, Note: note, CreatedAt: createdAt,
	}
	bytes, err := json.Marshal(l)
	if err != nil {
		return err
	}
	return ctx.GetStub().PutState(lienKey(id), bytes)
}

func (s *SmartContract) GetFraudCase(ctx contractapi.TransactionContextInterface, id string) (*FraudCase, error) {
	bytes, err := ctx.GetStub().GetState(fraudCaseKey(id))
	if err != nil || bytes == nil {
		return nil, fmt.Errorf("case not found")
	}
	var c FraudCase
	if err := json.Unmarshal(bytes, &c); err != nil {
		return nil, err
	}
	return &c, nil
}

func (s *SmartContract) GetLien(ctx contractapi.TransactionContextInterface, id string) (*LienAction, error) {
	bytes, err := ctx.GetStub().GetState(lienKey(id))
	if err != nil || bytes == nil {
		return nil, fmt.Errorf("lien not found")
	}
	var l LienAction
	if err := json.Unmarshal(bytes, &l); err != nil {
		return nil, err
	}
	return &l, nil
}

// ValidLienOutcomes documents allowed policy results for integrators.
func (s *SmartContract) ValidLienOutcomes(ctx contractapi.TransactionContextInterface) ([]string, error) {
	_ = ctx
	_ = time.Now()
	return []string{
		"LIEN_ACTIVE",
		"PARTIAL_LIEN",
		"PRO_RATA_LIEN",
		"HOP_FOLLOW",
		"OUTFLOWED",
		"GOOD_FAITH_EXIT",
		"PREVENT_FURTHER_CREDIT",
		"REJECTED_NO_CASE_FIELDS",
		"REJECTED_WHOLE_ACCOUNT",
		"REJECTED_GOOD_FAITH_MERCHANT",
	}, nil
}
