#!/bin/sh
while getopts "f:" arg; do
  case $arg in
    f) FILE=$OPTARG;;
  esac
done

export NODE_OPTIONS=--max-old-space-size=4096

npx buidler clean
npx buidler compile --config ./buidlerCoverageSol4.js

if [ -n "$FILE" ]
then
    npx buidler coverage --config ./buidlerConfigSol6.js --testfiles $FILE --solcoverjs ".solcover.js" --temp ""
else
    npx buidler coverage --config ./buidlerConfigSol6.js --testfiles "" --solcoverjs ".solcover.js" --temp ""
fi
