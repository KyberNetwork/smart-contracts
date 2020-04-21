#!/bin/sh
while getopts "f:" arg; do
  case $arg in
    f) FILE=$OPTARG;;
  esac
done

npx buidler clean
npx buidler compile --config ./buidlerCoverageSol4.js

if [ -n "$FILE" ]
then
    npx buidler coverage --config ./buidlerConfigSol5.js --testfiles $FILE --solcoverjs ".solcover.js" --temp ""
else
    npx buidler coverage --config ./buidlerConfigSol5.js --solcoverjs ".solcover.js" --temp ""  --testfiles ""
fi
