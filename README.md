## Introduction
This repository contains kyber network smart contracts.
For more details, please visit our [developer portal](https://developer.kyber.network/)

## Compilation with Buidler
`bash compilation.sh`

## Testing with Buidler
Run `ganache-cli -e 1000` in another terminal
`npx buidler test --no-compile --config buidlerConfigV4.js`


## Example of V4 & V5 contracts in test
`npx buidler test --no-compile --config buidlerConfigV4.js ./testV5/limitOrder.js`
