#!/bin/sh
while getopts "f:" arg; do
  case $arg in
    f) FILE=$OPTARG;;
  esac
done

ganache-cli -e 1000 -q & 2> /dev/null
pid=$!
sleep 3
npx buidler test --no-compile --config buidlerConfigV4.js $FILE
kill -9 $pid
