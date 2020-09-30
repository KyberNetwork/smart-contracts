#!/bin/sh
ALL=false

while getopts "f:" arg; do
  case $arg in
    f) FILE=$OPTARG;;
  esac
done

export NODE_OPTIONS=--max-old-space-size=4096

if [ -n "$FILE" ]; then
  npx buidler test --no-compile $FILE
else
  echo "Running all tests..."
  npx buidler test --no-compile --show-stack-traces
fi
