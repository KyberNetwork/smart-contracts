#!/bin/bash

node contractSizeReport.js $TRAVIS_PULL_REQUEST_BRANCH
node gasUsedReport.js $TRAVIS_PULL_REQUEST_BRANCH
