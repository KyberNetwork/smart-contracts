#!/bin/sh

for _ in {1..100}
do
    npx buidler test --no-compile test/sol6/tradeFuzzTests.js
done
