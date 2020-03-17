#!/bin/bash
# -*- firestarter: "shfmt -i 4 -ci -w %p" -*-

set -euxo pipefail

readonly test_part=${TEST_PART:-}

case "$test_part" in
Sol5)
    npx buidler test --no-compile --config buidlerCoverageSol5.js
    ;;
Coverage)
    if [[ $TRAVIS_PULL_REQUEST ]]; then
        echo "Not run coverage on pull request"
    elif [[ $TRAVIS_BRANCH == $COVERAGE_BRANCH ]]; then
        ./coverage.sh
    else
        echo "Not run coverage on $TRAVIS_BRANCH"
    fi
    ;;
*)
    echo "test case not define yet"
    ;;
esac
