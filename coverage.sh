#!/bin/sh
while getopts "f:" arg; do
  case $arg in
    f) FILE=$OPTARG;;
  esac
done

#npx buidler compile --config ./coverageConfig/buidlerCoverageV4.js <-- waiting for buidler fix
node --max-old-space-size=4096 node_modules/.bin/buidler compile --config ./buidlerCoverageV4.js
if [ -n "$FILE" ]
then
    npx buidler coverage --config ./buidlerCoverageV5.js --testfiles $FILE
else
    npx buidler coverage --config ./buidlerCoverageV5.js
fi
