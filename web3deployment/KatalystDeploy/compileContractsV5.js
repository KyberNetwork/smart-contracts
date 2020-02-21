const fs = require('fs-extra');
const path = require('path');
const solc = require('solc');
const contractPath = path.join(__dirname, '../../contractsV5/');

function compilingPreperations() {
    const buildPath = path.resolve(__dirname, 'build');
    fs.removeSync(buildPath);
    return buildPath;
}

function createConfiguration() {
    return {
        language: 'Solidity',
        'sources': {
            'FeeHandler.sol' : {content: fs.readFileSync(contractPath + 'FeeHandler.sol', 'utf8')},
            'GasHelper.sol' : {content: fs.readFileSync(contractPath + 'GasHelper.sol', 'utf8')},
            'PermissionGroupsV5.sol' : {content: fs.readFileSync(contractPath + 'PermissionGroupsV5.sol', 'utf8')},
            'BytesLib.sol' : {content: fs.readFileSync(contractPath + 'BytesLib.sol', 'utf8')},
            'IGasHelper.sol': {content: fs.readFileSync(contractPath + 'IGasHelper.sol', 'utf8')},
            'IERC20.sol' : {content: fs.readFileSync(contractPath + 'IERC20.sol', 'utf8')},
            'IBurnableToken.sol' : {content: fs.readFileSync(contractPath + 'IBurnableToken.sol', 'utf8')},
            'IFeeHandler.sol' : {content: fs.readFileSync(contractPath + 'IFeeHandler.sol', 'utf8')},
            'IKyberDAO.sol' : {content: fs.readFileSync(contractPath + 'IKyberDAO.sol', 'utf8')},
            'IKyberHint.sol' : {content: fs.readFileSync(contractPath + 'IKyberHint.sol', 'utf8')},
            'IKyberNetwork.sol' : {content: fs.readFileSync(contractPath + 'IKyberNetwork.sol', 'utf8')},
            'IKyberNetworkProxy.sol' : {content: fs.readFileSync(contractPath + 'IKyberNetworkProxy.sol', 'utf8')},
            'IKyberReserve.sol' : {content: fs.readFileSync(contractPath + 'IKyberReserve.sol', 'utf8')},
            'IKyberTradeLogic.sol' : {content: fs.readFileSync(contractPath + 'IKyberTradeLogic.sol', 'utf8')},
            'ISimpleKyberProxy.sol' : {content: fs.readFileSync(contractPath + 'ISimpleKyberProxy.sol', 'utf8')},
            'KyberNetwork.sol' : {content: fs.readFileSync(contractPath + 'KyberNetwork.sol', 'utf8')},
            'KyberNetworkProxy.sol' : {content: fs.readFileSync(contractPath + 'KyberNetworkProxy.sol', 'utf8')},
            'KyberTradeLogic.sol' : {content: fs.readFileSync(contractPath + 'KyberTradeLogic.sol', 'utf8')}, 
            'KyberHintHandler.sol' : {content: fs.readFileSync(contractPath + 'KyberHintHandler.sol', 'utf8')},
            'ReentrancyGuard.sol' : {content: fs.readFileSync(contractPath + 'ReentrancyGuard.sol', 'utf8')},
            'UtilsV5.sol' : {content: fs.readFileSync(contractPath + 'UtilsV5.sol', 'utf8')},
            'WithdrawableV5.sol' : {content: fs.readFileSync(contractPath + 'WithdrawableV5.sol', 'utf8')} 
        },
        settings: {
            outputSelection: { // return everything
                '*': {
                    '*': ['*']
                }
            },
            // Optional: Optimizer settings
            'optimizer': {
                'enabled': true,
                // Optimize for how many times you intend to run the code.
                // Lower values will optimize more for initial deployment cost, higher
                // values will optimize more for high-frequency usage.
                'runs': 200,
            },
            'evmVersion': 'constantinople'
        }
    };
}

function getImports(dependency) {
    console.log('Searching for dependency: ', dependency);
}

function compileSources(config) {
    try {
        return JSON.parse(solc.compile(JSON.stringify(config), getImports));
    } catch (e) {
        console.log(e);
    }
}

function errorHandling(compiledSources) {
    if (!compiledSources) {
        console.error('>>>>>>>>>>>>>>>>>>>>>>>> ERRORS <<<<<<<<<<<<<<<<<<<<<<<<\n', 'NO OUTPUT');
    } else if (compiledSources.errors) { // something went wrong.
        console.error('>>>>>>>>>>>>>>>>>>>>>>>> ERRORS <<<<<<<<<<<<<<<<<<<<<<<<\n');
        compiledSources.errors.map(error => console.log(error.formattedMessage));
    }
}

module.exports.compileContracts = main;

async function main () {
    compilingPreperations();
    const config = createConfiguration();
    // console.log('config')
    // console.log(config)
    let output = compileSources(config);
    errorHandling(output);
    // console.log(output.contracts['GasHelper.sol']);
    // console.log(output);

    return output;
}

main();
