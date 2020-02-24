const fs = require('fs');
const path = require('path');
const mv = require('mv');

const v4ArtifactsPath = path.join(__dirname, '.coverageV4Artifacts');
const targetArtifactPath = path.join(__dirname, '.coverage_artifacts');

function moveFiles(config) {
    fs.readdir(v4ArtifactsPath, (err, files) => {
        if (err) console.log(err);
        files.forEach(file => {
            mv(path.join(v4ArtifactsPath, file), path.join(targetArtifactPath, file), err => {
                if (err) throw err;
                console.log(`Moving ` + file);
            });
        })
    }) 
}

function removeV4ArtifactsDir(config) {
    fs.rmdir(v4ArtifactsPath, err => {
        if (err) console.log(err);
    })
}

module.exports = {
    providerOptions: {
        "default_balance_ether": 5000
    },
    istanbulReporter: ['html','json'],
    onCompileComplete: moveFiles,
    onIstanbulComplete: removeV4ArtifactsDir
}