#!/bin/sh
#npx buidler compile --config buidlerConfigV4.js <-- waiting for buidler fix
npx buidler compile
node --max-old-space-size=4096 node_modules/.bin/buidler compile --config buidlerConfigV4.js
