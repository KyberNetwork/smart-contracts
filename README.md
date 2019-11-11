## Introduction
This repository contains kyber network smart contracts.
For more details, please visit our [developer portal](https://developer.kyber.network/)

## Setup
1. Clone this repo
2. `npm ci`

## Compilation with Buidler
`./compilation.sh`

## Testing full contract suite with Buidler
1. If contracts have not been compiled, run `./compilation.sh`. This step can be skipped subsequently.
2. Run `./tst.sh`
3. Use `-f` for running a specific test file.

### Example Commands
`./tst.sh -f "./test/kyberReserve.js"`

## Testing with Istanbul Hardfork
As of the time of writing, `ganache-cli`  does not yet support the Istanbul hardfork. Kindly perform the following steps to run ganache manually.
1. Clone the [ganache-cli repo](https://github.com/trufflesuite/ganache-cli/)
2. CD into the repo and `npm i`
3. `node cli.js -k istanbul`
4. In another terminal, cd into this repo. To test against the full suite, simply do `npx buidler test --no-compile`. Otherwise, do `npx buidler test --no-compile {FILE_DIRECTORY}`

### Example
`npx buidler test --no-compile ./test/kyberNetwork.js`