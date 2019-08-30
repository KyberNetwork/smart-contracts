#!/bin/bash
npm i
node --max-old-space-size=4096 node_modules/.bin/buidler compile --config buidlerConfigV4.js
npx buidler compile --config buidlerCompileV5.js
