## Introduction
This repository contains kyber network smart contracts.
For more details, please visit our [developer portal](https://developer.kyber.network/)

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
4. Use `-k` to specify a specific hardfork version. Default: `Istanbul`
5. Use `-a` to run both sol4 and sol5 tests. Runs only sol5 tests by default.

### Example Commands
`./tsts.sh` (Run only sol5 tests)
`./tst.sh -f ./test/kyberReserve.js` (Test only kyberReserve.js)
`./tst.sh -f ./test/kyberNetworkProxy.js -k petersburg` (Test only kyberNetworkProxy on Petersburg)
`./tst.sh -a` (Run both sol4 and sol5 tests)

### Example
`npx buidler test --no-compile ./test/kyberNetwork.js`

## Coverage with `buidler-coverage`
1. Run `./coverage.sh`
2. Use `-f` for running a specific test file.

### Example Commands
`./coverage.sh -f ./test/sol5/kyberNetwork.js` (Coverage for only kyberNetwork.js)