#!/bin/sh
YLWBGBLK='\033[1;43;30m'
NC='\033[0m'
ALL=false

while getopts ":a:f:k" arg; do
  case $arg in
    a) ALL=true;;
    f) FILE=$OPTARG;;
    k) FORK=$OPTARG;;
  esac
done

if [ -n "$FORK" ] 
then
  printf "${YLWBGBLK}Running fork: $FORK${NC}\n\n"
  npx ganache-cli -e 1000 -k $FORK -q & 2> /dev/null
else
  npx ganache-cli -e 1000 -q & 2> /dev/null
fi

pid=$!
sleep 3
if [ -n "$FILE" ]; then
  npx buidler test --no-compile $FILE
elif [ "$ALL" ]; then
  echo "Running all tests..."
  npx buidler test --no-compile
else
  npx buidler test --no-compile --config ./buidlerCoverageSol5.js
fi
kill -9 $pid
