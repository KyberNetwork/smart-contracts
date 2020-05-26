#!/bin/sh
export NODE_OPTIONS=--max-old-space-size=4096
npx buidler compile &&
npx buidler compile --config buidlerConfigSol5.js &&
npx buidler compile --config buidlerConfigSol4.js &&
node contractSizeReport.js
