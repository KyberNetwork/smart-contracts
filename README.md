## Introduction
This repository contains kyber network smart contracts.
For more details, please visit our [developer portal](https://developer.kyber.network/)

## API
Public facing interfaces for kyber network (folder: contracts/sol6):
1. IKyberNetworkProxy.sol - Get rate and trade APIs. Hint handler address.
2. ISimpleKyberProxy.sol - Simple trade functions.
3. IKyberHintHandler.sol - Build hints for advanced trade functionality.
4. IKyberDao - Interact with KyberDao.
5. Dao/IKyberStaking - interact with KyberStaking.

## Setup
1. Clone this repo
2. `npm ci`

## Compilation with Buidler
1. `./cmp.sh` to compile contracts for all solidity versions.
2. `./cmpSol6.sh` to compile only sol6 contracts

## Testing with Buidler
1. If contracts have not been compiled, run `./cmp.sh`. This step can be skipped subsequently.
2. Run `./tst.sh`
3. Use `-f` for running a specific test file.
5. Use `-a` to run tests for all solidity versions. Runs only sol6 tests by default.

### Example Commands
`./tst.sh` (Run only sol6 tests)
`./tst.sh -f ./test/sol4/kyberReserve.js` (Test only kyberReserve.js)
`./tst.sh -a` (Run sol4, sol5, sol6 tests)

### Example
`npx buidler test --no-compile ./test/sol6/kyberNetwork.js`

## Coverage with `buidler-coverage`
1. Run `./coverage.sh`
2. Use `-f` for running a specific test file.

### Example Commands
`./coverage.sh -f ./test/sol6/kyberNetwork.js` (Coverage for only kyberNetwork.js)
