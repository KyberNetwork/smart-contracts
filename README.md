## Introduction
This repository contains kyber network smart contracts.
For more details, please visit our [developer portal](https://developer.kyber.network/)

## Compilation with Buidler
`bash compilation.sh`

## Testing full contract suite with Buidler
1. If contracts have not been compiled, run `bash compilation.sh`. This step can be skipped subsequently.
2. Run `ganache-cli -e 1000` in another terminal
3. `npx buidler test --no-compile --config buidlerConfigV4.js`


## Example of V4 & V5 contracts in test
1. If contracts have not been compiled, run `bash compilation.sh`. This step can be skipped subsequently.
2. Run `ganache-cli -e 1000` in another terminal
3. `npx buidler test --no-compile --config buidlerConfigV4.js ./testV4\&5/limitOrder.js`

### Explanation
- Mock Kyber Network contract written and compiled with 0.4.18
- Limit order contract and test token written in 0.5.9
- Limit order test script written in web3 0.2.x syntax
