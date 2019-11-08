#!/bin/sh
while getopts "f:k:" arg; do
  case $arg in
    f) FILE=$OPTARG;;
    k) FORK=$OPTARG;;
  esac
done

if [ -n "$FORK" ]
then
  npx ganache-cli -e 1000 -q & 2> /dev/null
else
  npx ganache-cli -e 1000 -k $FORK -q & 2> /dev/null
fi

pid=$!
sleep 3
if [ -n "$FILE" ]
then
  npx buidler test --no-compile $FILE
else
  npx buidler test --no-compile
fi
kill -9 $pid