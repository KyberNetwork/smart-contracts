const fs = require('fs');
const util = require('util');
const readdir = util.promisify(fs.readdir);
const path = require("path");
const artifactsPath = path.join(__dirname, "../artifacts/");
const buidlerConfigSol5 = path.join(__dirname, "../buidlerConfigSol5.js");
const buidlerConfigSol4 = path.join(__dirname, "../buidlerConfigSol4.js");
const execSync = require('child_process').execSync;

module.exports.retrieveArtifacts = main;
async function main(skipCompilation) {
  if (!skipCompilation) {
    compileContracts();
  }
  let output = await packageArtifacts();
  return output;
}

async function packageArtifacts() {
  let result = {};
  files = await readdir(artifactsPath);
  files.forEach(file => {
    content = JSON.parse(fs.readFileSync(path.join(artifactsPath, file)));
    result[content.contractName] = content;
  })
  return result;
}


function compileContracts() {
  console.log("Compiling contracts...");
  execSync(`npx buidler compile`, { encoding: 'utf-8' });
  execSync(`npx buidler compile --config ${buidlerConfigSol5}`, { encoding: 'utf-8'});
  execSync(`npx buidler compile --config ${buidlerConfigSol4}`, { encoding: 'utf-8'});
}

main();
