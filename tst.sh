#!/bin/sh
ALL=false

while getopts ":a:f:" arg; do
  case $arg in
    a) ALL=true;;
    f) FILE=$OPTARG;;
  esac
done

if [ -n "$FILE" ]; then
  npx buidler test --no-compile $FILE
elif [ "$ALL" ]; then
  echo "Running all tests..."
  npx buidler test --no-compile
else
  npx buidler test --no-compile --config ./buidlerCoverageSol5.js
fi

