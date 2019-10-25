#!/bin/sh
while getopts "f:" arg; do
  case $arg in
    f) FILE=$OPTARG;;
  esac
done

if [ -n "$FILE" ]
then
  npx buidler test --no-compile $FILE
else
  npx buidler test --no-compile
fi
