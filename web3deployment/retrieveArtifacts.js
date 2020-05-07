const fs = require('fs');
const util = require('util');
const readdir = util.promisify(fs.readdir);
const path = require("path");
const artifactsPath = path.join(__dirname, "../artifacts/");
const execSync = require('child_process').execSync;

module.exports.retrieveArtifacts = main;
async function main() {
  if (fs.existsSync(artifactsPath)) {
    let output = await packageArtifacts();
    return output;
  } else {
    compileArtifacts();
    main();
  }
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


function compileArtifacts() {
  console.log("Artifacts not found. Compiling contracts...");
  execSync('npx buidler compile', { encoding: 'utf-8' });
  execSync('npx buidler compile --config ../buidlerConfigSol5.js', { encoding: 'utf-8'});
  execSync('npx buidler compile --config ../buidlerConfigSol4.js', { encoding: 'utf-8'});
}

main();
