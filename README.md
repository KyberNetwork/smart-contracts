# Scope of audit
All the contracts in the [`contracts` directory](https://github.com/KyberNetwork/smart-contracts/tree/auditv2/contracts) *excluding*:
1. `Migration.sol`
2. All contracts in `mockContracts`
3. `abi` directory

# Regresssion
1. `npm install`
2. `testrpc`
3. `./node_modules/.bin/truffle test`

# Documentation
1. First version of smart contracts is explained (here)[https://blog.kyber.network/kyber-network-smart-contract-29fd7b46a7af]
2. Changes in the second version are descirbed (here)[https://medium.com/p/b64a5c1082b0/edit]
