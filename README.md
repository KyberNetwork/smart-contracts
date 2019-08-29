## Introduction
This repository contains kyber network smart contracts.
For more details, please visit our [developer portal](https://developer.kyber.network/)

## Testing with Buidler
1. `npm i`
2. `node --max-old-space-size=4096 node_modules/.bin/buidler compile --config buidlerConfig.js`
3. Run `ganache-cli -e 1000` in another terminal
4. `npx buidler test --no-compile --config buidlerConfig.js`
