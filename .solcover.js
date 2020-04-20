const fs = require('fs');
const path = require('path');
const mv = require('mv');

const previousArtifactsPath = path.join(__dirname, '.coverageArtifacts');
const targetArtifactPath = path.join(__dirname, '.coverage_artifacts');

function moveFiles(config) {
    fs.readdir(previousArtifactsPath, (err, files) => {
        if (err) console.log(err);
        files.forEach(file => {
            mv(path.join(previousArtifactsPath, file), path.join(targetArtifactPath, file), err => {
                if (err) throw err;
                console.log(`Moving ` + file);
            });
        })
    })
}

function removeArtifactsDir(config) {
    fs.rmdir(previousArtifactsPath, err => {
        if (err) console.log(err);
    })
}

module.exports = {
    providerOptions: {
        "default_balance_ether": 100000000000000,
        "total_accounts": 20
    },
    skipFiles: ['Dao/mock/', 'mock/', 'utils/zeppelin/'],
    istanbulReporter: ['html','json'],
    onCompileComplete: moveFiles,
    onIstanbulComplete: removeArtifactsDir
}
