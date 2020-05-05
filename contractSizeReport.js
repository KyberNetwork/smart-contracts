'use strict';
const fs = require('fs');
const util = require('util');

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

async function main() {
  let contractSizeReport = await generateCodeSizeReport();
  console.log("Contract size report");
  console.log(contractSizeReport);
  await writeReport();
}

main()