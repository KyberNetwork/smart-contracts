#!/bin/bash
# -*- firestarter: "shfmt -i 4 -ci -w %p" -*-

set -euxo pipefail

readonly test_part=${TEST_PART:-}

case "$test_part" in
Sol5)
    npx buidler test --no-compile --config buidlerCoverageSol5.js
    ;;
*)
    echo "test case not define yet"
    ;;
esac
