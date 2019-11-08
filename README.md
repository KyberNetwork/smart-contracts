## Introduction
This repository contains kyber network smart contracts.
For more details, please visit our [developer portal](https://developer.kyber.network/)

## Setup
1. Clone this repo
2. `npm i`

## Compilation with Buidler
`./compilation.sh`

## Testing full contract suite with Buidler
1. If contracts have not been compiled, run `./compilation.sh`. This step can be skipped subsequently.
2. Run `./tst.sh`
3. Use `-f` for running a specific test file.
4. Use `-k` to specify a specific hardfork version.

### Example Commands
`./tst.sh -f "./test/kyberReserve.js"`
`./tst.sh -f "./test/kyberReserve.js" -k istanbul`

## Testing with Istanbul Hardfork

### Example
`npx buidler test --no-compile ./test/kyberNetwork.js`