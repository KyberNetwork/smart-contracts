#!/bin/sh
while getopts "f:" arg; do
  case $arg in
    f) FILE=$OPTARG;;
  esac
done

npx ganache-cli -e 1000 -q & 2> /dev/null
pid=$!
sleep 3
if [ -n "$FILE" ]
then
  npx buidler test --no-compile $FILE
else
  npx buidler test --no-compile
fi
kill -9 $pid