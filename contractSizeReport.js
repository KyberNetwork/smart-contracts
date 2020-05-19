'use strict';
const fs = require('fs');
const util = require('util');
const got = require('got');
const yargs = require('yargs');

let path = 'artifacts';

const readdir = util.promisify(fs.readdir);

let argv = yargs.default('branch', 'Katalyst').alias('b', 'branch').argv;

async function generateCodeSizeReport() {
  let result = {};
  let fileNames = await readdir(path);
  for (let i = 0; i < fileNames.length; i++) {
    let fileName = fileNames[i];
    let rawData = fs.readFileSync(path + '/' + fileName);
    let contractData = JSON.parse(rawData);
    let codeSize = contractData.deployedBytecode.length / 2 - 1;
    if (codeSize > 0) {
      result[fileName] = codeSize;
    }
  }
  return result;
}

async function writeReport(report) {
  let jsonContent = JSON.stringify(report, null, '\t');
  let reportDir = 'report';
  if (process.env.TRAVIS_BRANCH !== undefined) {
    reportDir = `report/${process.env.TRAVIS_BRANCH}`;
  }
  let reportFile = `${reportDir}/contractSize.json`;
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, {recursive: true});
  }
  fs.writeFile(reportFile, jsonContent, 'utf8', function (err) {
    if (err) {
      console.log('An error occured while writing JSON Object to File.');
      return console.log(err);
    }
  });
}

async function getRemoteReport() {
  try {
    const url = `http://katalyst-coverage.knstats.com/report/${argv.branch}/contractSize.json`;
    return await got(url).json();
  } catch (error) {
    // console.log(error);
    return false;
  }
}

async function compareContractSize() {
  let contractSizeReport = await generateCodeSizeReport();
  await writeReport(contractSizeReport);
  let remoteReport = await getRemoteReport();
  if (!remoteReport) {
    console.log(`Could not get report for ${argv.branch}`);
    console.log("Current contract size report");
    console.table(contractSizeReport);
    return false;
  }
  let diffDict = {};
  for (let contract in contractSizeReport) {
    if (contract in remoteReport) {
      let baseBranchSize = remoteReport[contract];
      let currentSize = contractSizeReport[contract];
      let diff = currentSize - baseBranchSize;
      if (diff != 0) {
        diffDict[contract] = {
          [argv.branch]: baseBranchSize,
          current: currentSize,
          diff: diff,
        };
      }
    }
  }
  for (let contract in remoteReport) {
    if (contract in remoteReport && !(contract in diffDict)) {
      let baseBranchSize = remoteReport[contract];
      let currentSize = contractSizeReport[contract];
      let diff = currentSize - baseBranchSize;
      if (diff != 0) {
        diffDict[contract] = {
          [argv.branch]: baseBranchSize,
          current: currentSize,
          diff: diff,
        };
      }
    }
  }
  if (Object.keys(diffDict).length > 0) {
    console.log(`There is change in following contract size with ${argv.branch}`);
    console.table(diffDict);
  } else {
    console.log("Contract size didn't change");
    console.table(contractSizeReport);
  }
}

compareContractSize();
