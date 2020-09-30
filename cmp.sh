#!/bin/sh
export NODE_OPTIONS=--max-old-space-size=4096
npx buidler compile &&
node contractSizeReport.js
