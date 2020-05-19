'use strict';
const fs = require('fs');
const util = require('util');
const got = require('got');
const yargs = require('yargs');

let argv = yargs.default('branch', 'Katalyst').alias('b', 'branch').argv;

async function getRemoteReport() {
  try {
    const url = `http://katalyst-coverage.knstats.com/report/${argv.branch}/gasUsed.json`;
    return await got(url).json();
  } catch (error) {
    // console.log(error);
    return false;
  }
}

async function getLocalReport() {
  let reportFile = `report/gasUsed.json`;
  if (process.env.TRAVIS_BRANCH !== undefined) {
    reportFile = `report/${process.env.TRAVIS_BRANCH}/gasUsed.json`;
  }
  let report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  return report
}

async function compareGasConsumtion() {
  let localReport = await getLocalReport();
  let remoteReport = await getRemoteReport();
  if (!remoteReport) {
    console.log(`Could not get report for ${argv.branch}. Current report`);
    console.table(localReport);
    return false;
  }
  let diffDict = {};
  for (let testCase in localReport) {
    if (testCase in remoteReport) {
      let baseBranchSize = remoteReport[testCase];
      let currentSize = localReport[testCase];
      let diff = currentSize - baseBranchSize;
      if (diff != 0) {
        diffDict[testCase] = {
          [argv.branch]: baseBranchSize,
          current: currentSize,
          diff: diff,
        };
      }
    }
  }
  for (let testCase in remoteReport) {
    if (testCase in remoteReport && !(testCase in diffDict)) {
      let baseBranchSize = remoteReport[testCase];
      let currentSize = localReport[testCase];
      let diff = currentSize - baseBranchSize;
      if (diff != 0) {
        diffDict[testCase] = {
          [argv.branch]: baseBranchSize,
          current: currentSize,
          diff: diff,
        };
      }
    }
  }
  if (Object.keys(diffDict).length > 0) {
    console.log(`There is change in following gas report with ${argv.branch}`);
    console.table(diffDict);
  } else {
    console.log("Gas report didn't change");
    console.table(localReport);
  }
}

compareGasConsumtion();
