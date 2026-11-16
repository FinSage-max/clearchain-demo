/*
SPDX-License-Identifier: Apache-2.0
*/

package main

import (
	"log"

	"github.com/clearchain/demo/chaincode/chaincode"
	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

func main() {
	cc, err := contractapi.NewChaincode(&chaincode.SmartContract{})
	if err != nil {
		log.Panicf("Error creating ClearChain chaincode: %v", err)
	}
	if err := cc.Start(); err != nil {
		log.Panicf("Error starting ClearChain chaincode: %v", err)
	}
}
