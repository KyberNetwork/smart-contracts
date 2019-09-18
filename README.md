## Introduction
This repository contains kyber network smart contracts.
For more details, please visit our [developer portal](https://developer.kyber.network/)

## Compilation with Buidler
`bash compilation.sh`

## Testing full contract suite with Buidler
1. If contracts have not been compiled, run `bash compilation.sh`. This step can be skipped subsequently.
2. Run `ganache-cli -e 1000` in another terminal
3. `npx buidler test --no-compile --config buidlerConfigV4.js`


## Example of V5 contract in test
1. If contracts have not been compiled, run `bash compilation.sh`. This step can be skipped subsequently.
2. Run `ganache-cli` in another terminal
3. `npx buidler test --no-compile --config buidlerConfigV4.js ./testV5/v5Example.js`

### Explanation
- Example contract written in 0.5.11
- Test written in web3 0.2.x syntax
