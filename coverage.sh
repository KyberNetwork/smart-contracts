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
    npx buidler coverage --config ./buidlerConfigSol5.js --testfiles $FILE
else
    npx buidler coverage --config ./buidlerConfigSol5.js --testfiles "" --solcoverjs ".solcover.js" --temp ""
fi
