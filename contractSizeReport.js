'use strict';
const fs = require('fs');
const util = require('util');
const got = require('got');

let path = "artifacts";

const readdir = util.promisify(fs.readdir)

async function generateCodeSizeReport(){
  let result = {}
  let fileNames = await readdir(path);
  fileNames.forEach(function(fileName){
    let rawData = fs.readFileSync(path + '/' + fileName)
    let contractData = JSON.parse(rawData);
    let codeSize = contractData.deployedBytecode.length/2-1;
    if (codeSize > 0){
      result[fileName] = codeSize;
    }
  });
  return result;
}

async function writeReport(report){
  var jsonContent = JSON.stringify(report,null,'\t');
  let reportDir = "report";
  if (process.env.TRAVIS_BRANCH !== undefined) {
    reportDir = `report/${process.env.TRAVIS_BRANCH}`
  }
  let reportFile = `${reportDir}/contractSize.json`
  console.log(reportFile)
  if (!fs.existsSync(reportDir)){
    fs.mkdirSync(reportDir, { recursive: true });
  }
  fs.writeFile(reportFile, jsonContent, 'utf8', function (err) {
    if (err) {
        console.log("An error occured while writing JSON Object to File.");
        return console.log(err);
    }
  });
}

async function getKatalystReport(){
  try {
    var url = "http://katalyst-coverage.knstats.com/Katalyst/contractSize.json"
    return await got(url).json();
  } catch (error) {
    console.log(error);
  }
}

function ContractDiff(katalystSize, currentSize, diff){
  this.katalystSize = katalystSize
  this.currentSize = currentSize
  this.diff = diff
}

async function compareContractSize() {
  let contractSizeReport = await generateCodeSizeReport();
  await writeReport(contractSizeReport);
  let katalystReport = await getKatalystReport();
  var diffDict = {}
  for (let fileName in contractSizeReport) {
    if (fileName in katalystReport) {
      let katalystSize = katalystReport[fileName];
      let currentSize = contractSizeReport[fileName];
      let diff = currentSize - katalystSize;
      if (diff != 0){
        diffDict[fileName] = new ContractDiff(katalystSize, currentSize, diff);
      }
    }
  }
  for (let fileName in katalystReport) {
    if ((fileName in katalystReport) && !(fileName in diffDict)){
      let katalystSize = katalystReport[fileName];
      let currentSize = contractSizeReport[fileName];
      let diff = currentSize - katalystSize;
      if (diff != 0){
        diffDict[fileName] = new ContractDiff(katalystSize, currentSize, diff)
      }
    }
  }
  if(Object.keys(diffDict).length > 0){
    console.log("There is change in following contract size");
    console.table(diffDict);
  } else {
    console.log("Contract size didn't change");
  }
}

compareContractSize()
