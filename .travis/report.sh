#!/bin/bash

sizeReport = `node contractSizeReport.js $TRAVIS_PULL_REQUEST_BRANCH`
gasReport = `node gasUsedReport.js $TRAVIS_PULL_REQUEST_BRANCH`
node travis/remove-all-bot-comment.js

if [[ $TRAVIS_PULL_REQUEST ]]; then
    curl -H "Authorization: token ${GITHUB_TOKEN}" -X POST \
    -d "{\"body\": \"$sizeReport\"}" \
    "https://api.github.com/repos/${TRAVIS_REPO_SLUG}/issues/${TRAVIS_PULL_REQUEST}/comments"

    curl -H "Authorization: token ${GITHUB_TOKEN}" -X POST \
    -d "{\"body\": \"$gasReport\"}" \
    "https://api.github.com/repos/${TRAVIS_REPO_SLUG}/issues/${TRAVIS_PULL_REQUEST}/comments"