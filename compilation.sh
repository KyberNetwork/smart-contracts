#!/bin/sh
npx buidler compile
#npx buidler compile --config buidlerConfigV4.js <-- waiting for buidler fix
node --max-old-space-size=4096 node_modules/.bin/buidler compile --config buidlerConfigV4.js