const fs = require('fs-extra');
const path = require('path');
const solc = require('solc');
const contractV4Path = path.join(__dirname, "../contracts/");
const contractV5Path = path.join(__dirname, '../contractsSol5/');
const solc418 = "v0.4.18+commit.9cf6e910";
const solc511 = "v0.5.11+commit.c082d0b4";
let compiler;
let config;

const sol4SourceFiles = {
    "ConversionRates.sol" : {content: fs.readFileSync(contractV4Path + 'reserves/fprConversionRate/ConversionRates.sol','utf8')},
    "ConversionRateEnhancedSteps.sol" : {content: fs.readFileSync(contractV4Path + 'reserves/fprConversionRate/ConversionRateEnhancedSteps.sol', 'utf8')},
    "ConversionRatesInterface.sol" : {content: fs.readFileSync(contractV4Path + 'ConversionRatesInterface.sol', 'utf8')},
    "reserves/fprConversionRate/ConversionRates.sol" : {content: fs.readFileSync(contractV4Path + 'reserves/fprConversionRate/ConversionRates.sol','utf8')},
    "reserves/VolumeImbalanceRecorder.sol" : {content: fs.readFileSync(contractV4Path + 'reserves/VolumeImbalanceRecorder.sol', 'utf8')},
    "VolumeImbalanceRecorder.sol" : {content: fs.readFileSync(contractV4Path + 'reserves/VolumeImbalanceRecorder.sol', 'utf8')},
    "PermissionGroups.sol" : {content: fs.readFileSync(contractV4Path + 'PermissionGroups.sol', 'utf8')},
    "ERC20Interface.sol" : {content: fs.readFileSync(contractV4Path + 'ERC20Interface.sol', 'utf8')},
    "KyberNetworkOld.sol" : {content: fs.readFileSync(contractV4Path + 'KyberNetworkOld.sol', 'utf8')},
    "KyberNetworkInterface.sol" : {content: fs.readFileSync(contractV4Path + 'KyberNetworkInterface.sol', 'utf8')},
    "KyberProxyOld.sol" : {content: fs.readFileSync(contractV4Path + 'KyberProxyOld.sol', 'utf8')},
    "KyberNetworkProxyInterface.sol" : {content: fs.readFileSync(contractV4Path + 'KyberNetworkProxyInterface.sol','utf8')},
    "KyberReserve.sol" : {content: fs.readFileSync(contractV4Path + 'reserves/KyberReserve.sol','utf8')},
    "KyberReserveInterface.sol" : {content: fs.readFileSync(contractV4Path + 'KyberReserveInterface.sol','utf8')},
    "LiquidityConversionRates.sol": {content: fs.readFileSync(contractV4Path + 'reserves/aprConversionRate/LiquidityConversionRates.sol','utf8')},
    "LiquidityFormula.sol": {content: fs.readFileSync(contractV4Path + 'reserves/aprConversionRate/LiquidityFormula.sol','utf8')},
    "OrderbookReserve.sol" : {content: fs.readFileSync(contractV4Path + 'reserves/orderBookReserve/permissionless/OrderbookReserve.sol', 'utf8')},
    "OrderbookReserveInterface.sol" : {content: fs.readFileSync(contractV4Path + 'reserves/orderBookReserve/permissionless/OrderbookReserveInterface.sol', 'utf8')},
    "OrderIdManager.sol" : {content: fs.readFileSync(contractV4Path + 'reserves/orderBookReserve/permissionless/OrderIdManager.sol', 'utf8')},
    "OrderList.sol" : {content: fs.readFileSync(contractV4Path + 'reserves/orderBookReserve/permissionless/OrderList.sol', 'utf8')},
    "OrderListFactory.sol" : {content: fs.readFileSync(contractV4Path + 'reserves/orderBookReserve/permissionless/OrderListFactory.sol', 'utf8')},
    "OrderListFactoryInterface.sol" : {content: fs.readFileSync(contractV4Path + 'reserves/orderBookReserve/permissionless/OrderListFactoryInterface.sol', 'utf8')},
    "OrderListInterface.sol" : {content: fs.readFileSync(contractV4Path + 'reserves/orderBookReserve/permissionless/OrderListInterface.sol', 'utf8')},
    "OrderListFactoryInterface.sol" : {content: fs.readFileSync(contractV4Path + 'reserves/orderBookReserve/permissionless/OrderListFactoryInterface.sol', 'utf8')},
    "PermissionGroups.sol" : {content: fs.readFileSync(contractV4Path + 'PermissionGroups.sol','utf8')},
    "KyberReserveInterface.sol" : {content: fs.readFileSync(contractV4Path + 'KyberReserveInterface.sol', 'utf8')},
    "SanityRates.sol" : {content: fs.readFileSync(contractV4Path + 'SanityRates.sol', 'utf8')},
    "SanityRatesInterface.sol" : {content: fs.readFileSync(contractV4Path + 'SanityRatesInterface.sol', 'utf8')},
    "SimpleNetworkInterface.sol" : {content: fs.readFileSync(contractV4Path + 'SimpleNetworkInterface.sol', 'utf8')},
    "Utils.sol" : {content: fs.readFileSync(contractV4Path + 'Utils.sol', 'utf8')},
    "Utils2.sol" : {content: fs.readFileSync(contractV4Path + 'Utils2.sol', 'utf8')},
    "Utils3.sol" : {content: fs.readFileSync(contractV4Path + 'Utils3.sol', 'utf8')},
    "Withdrawable.sol" : {content: fs.readFileSync(contractV4Path + 'Withdrawable.sol', 'utf8')},
    "KyberUniswapReserve.sol" : {content: fs.readFileSync(contractV4Path + 'reserves/bridgeReserves/uniswap/KyberUniswapReserve.sol', 'utf8')},
    "WrapperBase.sol" : {content: fs.readFileSync(contractV4Path + 'wrappers/WrapperBase.sol', 'utf8')},
    "SetStepFunctionWrapper.sol" : {content: fs.readFileSync(contractV4Path + 'wrappers/SetStepFunctionWrapper.sol', 'utf8')},
    "WrapConversionRate.sol" : {content: fs.readFileSync(contractV4Path + 'wrappers/WrapConversionRate.sol', 'utf8')},
    "WrapReadTokenData.sol" : {content: fs.readFileSync(contractV4Path + 'wrappers/WrapReadTokenData.sol', 'utf8')}
}

const sol5SourceFiles = {
    'KyberFeeHandler.sol' : {content: fs.readFileSync(contractV5Path + 'KyberFeeHandler.sol', 'utf8')},
    'GasHelper.sol' : {content: fs.readFileSync(contractV5Path + 'GasHelper.sol', 'utf8')},
    'PermissionGroups2.sol' : {content: fs.readFileSync(contractV5Path + 'PermissionGroups2.sol', 'utf8')},
    'BytesLib.sol' : {content: fs.readFileSync(contractV5Path + 'BytesLib.sol', 'utf8')},
    'IGasHelper.sol': {content: fs.readFileSync(contractV5Path + 'IGasHelper.sol', 'utf8')},
    'IERC20.sol' : {content: fs.readFileSync(contractV5Path + 'IERC20.sol', 'utf8')},
    'IBurnableToken.sol' : {content: fs.readFileSync(contractV5Path + 'IBurnableToken.sol', 'utf8')},
    'IKyberFeeHandler.sol' : {content: fs.readFileSync(contractV5Path + 'IKyberFeeHandler.sol', 'utf8')},
    'IKyberDAO.sol' : {content: fs.readFileSync(contractV5Path + 'IKyberDAO.sol', 'utf8')},
    'IKyberHint.sol' : {content: fs.readFileSync(contractV5Path + 'IKyberHint.sol', 'utf8')},
    'IKyberNetwork.sol' : {content: fs.readFileSync(contractV5Path + 'IKyberNetwork.sol', 'utf8')},
    'IKyberNetworkProxy.sol' : {content: fs.readFileSync(contractV5Path + 'IKyberNetworkProxy.sol', 'utf8')},
    'IKyberReserve.sol' : {content: fs.readFileSync(contractV5Path + 'IKyberReserve.sol', 'utf8')},
    'IKyberTradeLogic.sol' : {content: fs.readFileSync(contractV5Path + 'IKyberTradeLogic.sol', 'utf8')},
    'ISimpleKyberProxy.sol' : {content: fs.readFileSync(contractV5Path + 'ISimpleKyberProxy.sol', 'utf8')},
    'KyberNetwork.sol' : {content: fs.readFileSync(contractV5Path + 'KyberNetwork.sol', 'utf8')},
    'KyberNetworkProxy.sol' : {content: fs.readFileSync(contractV5Path + 'KyberNetworkProxy.sol', 'utf8')},
    'KyberTradeLogic.sol' : {content: fs.readFileSync(contractV5Path + 'KyberTradeLogic.sol', 'utf8')}, 
    'KyberHintHandler.sol' : {content: fs.readFileSync(contractV5Path + 'KyberHintHandler.sol', 'utf8')},
    'ReentrancyGuard.sol' : {content: fs.readFileSync(contractV5Path + 'ReentrancyGuard.sol', 'utf8')},
    'Utils4.sol' : {content: fs.readFileSync(contractV5Path + 'Utils4.sol', 'utf8')},
    'Withdrawable2.sol' : {content: fs.readFileSync(contractV5Path + 'Withdrawable2.sol', 'utf8')} 
}

function compilingPreparations() {
    const buildPath = path.resolve(__dirname, 'build');
    fs.removeSync(buildPath);
    return buildPath;
}

function createConfiguration(sourceFiles) {
    return {
        language: 'Solidity',
        'sources': sourceFiles,
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
                'runs': 9000,
            }
        }
    };
}

function getImports(dependency) {
    console.log('Searching for dependency: ', dependency);
}

async function loadSpecificCompiler(solcVersion) {
    console.log(`Downloading compiler ${solcVersion}`);
    return await solc.loadRemoteVersion(solcVersion, async function (err, solc_specific) {
        if (err) {
            console.log(err);
        } else {
            compiler = solc_specific;
            return;
        }
    });
};

function errorHandling(compiledSources) {
    if (!compiledSources) {
        console.error('>>>>>>>>>>>>>>>>>>>>>>>> ERRORS <<<<<<<<<<<<<<<<<<<<<<<<\n', 'NO OUTPUT');
    } else if (compiledSources.errors) { // something went wrong.
        console.error('>>>>>>>>>>>>>>>>>>>>>>>> ERRORS <<<<<<<<<<<<<<<<<<<<<<<<\n');
        compiledSources.errors.map(error => console.log(error.formattedMessage));
    }
}

function sleep(ms){
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
}

module.exports.compileContracts = compileContracts;
async function compileContracts(versionNum) {
    let solcVersionNum;
    let sourceFiles;
    if (versionNum == "sol4") {
        solcVersionNum = solc418;
        sourceFiles = sol4SourceFiles;
    } else if (versionNum == "sol5") {
        solcVersionNum = solc511;
        sourceFiles = sol5SourceFiles;
    } else {
      console.log(`invalid version number ${versionNum}`);
      process.exit(0);
    }

    while (compiler == undefined) {
        compiler = await loadSpecificCompiler(solcVersionNum);
        await sleep(10000); //change time based on internet connection
    }
    compilingPreparations();
    const config = createConfiguration(sourceFiles);
    output = JSON.parse(compiler.compile(JSON.stringify(config)));
    errorHandling(output);
    // console.log(output.contracts['GasHelper.sol']);
    return output;
}

module.exports.compileSol4Contracts = compileSol4Contracts;
async function compileSol4Contracts() {
    return await compileContracts("sol4");
}

module.exports.compileSol5Contracts = compileSol5Contracts;
async function compileSol5Contracts() {
    return await compileContracts("sol5");
}

module.exports.compileAllContracts = main;
async function main() {
    let output = {'contracts': {}, 'sources': {}};
    //TODO: combine outputs
    let v4Output = await compileContracts("sol4");
    let v5Output = await await compileContracts("sol5");
    return [v4Output, v5Output];
}