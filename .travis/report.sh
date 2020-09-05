#!/bin/bash

readonly test_part=${TEST_PART:-}
case "$test_part" in
All)
    if [[ $TRAVIS_PULL_REQUEST ]]; then
        export sizeReport=$(node contractSizeReport.js $TRAVIS_PULL_REQUEST_BRANCH)
        export gasReport=$(node gasUsedReport.js $TRAVIS_PULL_REQUEST_BRANCH)
        node travis/remove-all-bot-comment.js
        curl -H "Authorization: token ${GITHUB_TOKEN}" -X POST \
        -d "{\"body\": \""$sizeReport"\"}" \
        "https://api.github.com/repos/${TRAVIS_REPO_SLUG}/issues/${TRAVIS_PULL_REQUEST}/comments"

        curl -H "Authorization: token ${GITHUB_TOKEN}" -X POST \
        -d "{\"body\": \""$gasReport"\"}" \
        "https://api.github.com/repos/${TRAVIS_REPO_SLUG}/issues/${TRAVIS_PULL_REQUEST}/comments"
    fi
    ;;
esac
