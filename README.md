## Introduction
This repository contains kyber network smart contracts.
For more details, please visit our [developer portal](https://developer.kyber.network/)

##API
Public facing interfaces for kyber (folder: contracts/sol6):
1. IKyberNetworkProxy.sol - Get rate and trade APIs. Hint handler address.
2. ISimpleKyberProxy.sol - Simple trade functions.
3. IKyberHintHandler.sol - Build hints for advanced trade functionality.
4. IkyberDAO - Interact with Kyber dao.

## Setup
1. Clone this repo
2. `npm ci`

## Compilation with Buidler
1. `./cmp.sh` to compile both sol4 and sol5 contracts
2. `./cmpSol5.sh` to compile only sol5 contracts

## Testing with Buidler
1. If contracts have not been compiled, run `./compilation.sh`. This step can be skipped subsequently.
2. Run `./tst.sh`
3. Use `-f` for running a specific test file.
5. Use `-a` to run both sol4 and sol5 tests. Runs only sol5 tests by default.

### Example Commands
`./tst.sh` (Run only sol5 tests)
`./tst.sh -f ./test/sol4/kyberReserve.js` (Test only kyberReserve.js)
`./tst.sh -a` (Run both sol4 and sol5 tests)

### Example
`npx buidler test --no-compile ./test/kyberNetwork.js`

## Coverage with `buidler-coverage`
1. Run `./coverage.sh`
2. Use `-f` for running a specific test file.

### Example Commands
`./coverage.sh -f ./test/sol5/kyberNetwork.js` (Coverage for only kyberNetwork.js)