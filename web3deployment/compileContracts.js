const fs = require("fs-extra");
const path = require("path");
const solc = require("solc");
const contractsSol4Path = path.join(__dirname, "../contracts/sol4/");
const contractsSol5Path = path.join(__dirname, "../contracts/sol5/");
const contractsSol6Path = path.join(__dirname, "../contracts/sol6/");
const solc418 = "v0.4.18+commit.9cf6e910";
const solc511 = "v0.5.11+commit.c082d0b4";
const solc66 = "v0.6.6+commit.6c089d02";
const solc418Path = path.join(
  __dirname,
  "./compilers/soljson-" + solc418 + ".js"
);
const solc511Path = path.join(
  __dirname,
  "./compilers/soljson-" + solc511 + ".js"
);
const solc66Path = path.join(
  __dirname,
  "./compilers/soljson-" + solc66 + ".js"
);
let compiler;

const sol4SourceFiles = {
  "ConversionRates.sol": {
    content: fs.readFileSync(
      contractsSol4Path + "reserves/fprConversionRate/ConversionRates.sol",
      "utf8"
    ),
  },
  "ConversionRateEnhancedSteps.sol": {
    content: fs.readFileSync(
      contractsSol4Path +
        "reserves/fprConversionRate/ConversionRateEnhancedSteps.sol",
      "utf8"
    ),
  },
  "ConversionRatesInterface.sol": {
    content: fs.readFileSync(
      contractsSol4Path + "ConversionRatesInterface.sol",
      "utf8"
    ),
  },
  "reserves/fprConversionRate/ConversionRates.sol": {
    content: fs.readFileSync(
      contractsSol4Path + "reserves/fprConversionRate/ConversionRates.sol",
      "utf8"
    ),
  },
  "reserves/VolumeImbalanceRecorder.sol": {
    content: fs.readFileSync(
      contractsSol4Path + "reserves/VolumeImbalanceRecorder.sol",
      "utf8"
    ),
  },
  "VolumeImbalanceRecorder.sol": {
    content: fs.readFileSync(
      contractsSol4Path + "reserves/VolumeImbalanceRecorder.sol",
      "utf8"
    ),
  },
  "PermissionGroups.sol": {
    content: fs.readFileSync(
      contractsSol4Path + "PermissionGroups.sol",
      "utf8"
    ),
  },
  "ERC20Interface.sol": {
    content: fs.readFileSync(
      contractsSol4Path + "ERC20Interface.sol","utf8"),
  },
  "KyberNetworkInterface.sol": {
    content: fs.readFileSync(
      contractsSol4Path + "KyberNetworkInterface.sol",
      "utf8"
    ),
  },
  "KyberProxyV1.sol": {
    content: fs.readFileSync(contractsSol4Path + "KyberProxyV1.sol", "utf8"),
  },
  "KyberNetworkProxyInterface.sol": {
    content: fs.readFileSync(
      contractsSol4Path + "KyberNetworkProxyInterface.sol",
      "utf8"
    ),
  },
  "KyberReserve.sol": {
    content: fs.readFileSync(
      contractsSol4Path + "reserves/KyberReserve.sol",
      "utf8"
    ),
  },
  "KyberReserveInterface.sol": {
    content: fs.readFileSync(
      contractsSol4Path + "KyberReserveInterface.sol",
      "utf8"
    ),
  },
  "LiquidityConversionRates.sol": {
    content: fs.readFileSync(
      contractsSol4Path +
        "reserves/aprConversionRate/LiquidityConversionRates.sol",
      "utf8"
    ),
  },
  "LiquidityFormula.sol": {
    content: fs.readFileSync(
      contractsSol4Path + "reserves/aprConversionRate/LiquidityFormula.sol",
      "utf8"
    ),
  },
  "OrderbookReserve.sol": {
    content: fs.readFileSync(
      contractsSol4Path +
        "reserves/orderBookReserve/permissionless/OrderbookReserve.sol",
      "utf8"
    ),
  },
  "OrderbookReserveInterface.sol": {
    content: fs.readFileSync(
      contractsSol4Path +
        "reserves/orderBookReserve/permissionless/OrderbookReserveInterface.sol",
      "utf8"
    ),
  },
  "OrderIdManager.sol": {
    content: fs.readFileSync(
      contractsSol4Path +
        "reserves/orderBookReserve/permissionless/OrderIdManager.sol",
      "utf8"
    ),
  },
  "OrderList.sol": {
    content: fs.readFileSync(
      contractsSol4Path +
        "reserves/orderBookReserve/permissionless/OrderList.sol",
      "utf8"
    ),
  },
  "OrderListFactory.sol": {
    content: fs.readFileSync(
      contractsSol4Path +
        "reserves/orderBookReserve/permissionless/OrderListFactory.sol",
      "utf8"
    ),
  },
  "OrderListFactoryInterface.sol": {
    content: fs.readFileSync(
      contractsSol4Path +
        "reserves/orderBookReserve/permissionless/OrderListFactoryInterface.sol",
      "utf8"
    ),
  },
  "OrderListInterface.sol": {
    content: fs.readFileSync(
      contractsSol4Path +
        "reserves/orderBookReserve/permissionless/OrderListInterface.sol",
      "utf8"
    ),
  },
  "OrderListFactoryInterface.sol": {
    content: fs.readFileSync(
      contractsSol4Path +
        "reserves/orderBookReserve/permissionless/OrderListFactoryInterface.sol",
      "utf8"
    ),
  },
  "PermissionGroups.sol": {
    content: fs.readFileSync(
      contractsSol4Path + "PermissionGroups.sol",
      "utf8"
    ),
  },
  "KyberReserveInterface.sol": {
    content: fs.readFileSync(
      contractsSol4Path + "KyberReserveInterface.sol",
      "utf8"
    ),
  },
  "SanityRates.sol": {
    content: fs.readFileSync(contractsSol4Path + "SanityRates.sol", "utf8"),
  },
  "SanityRatesInterface.sol": {
    content: fs.readFileSync(
      contractsSol4Path + "SanityRatesInterface.sol",
      "utf8"
    ),
  },
  "SimpleNetworkInterface.sol": {
    content: fs.readFileSync(
      contractsSol4Path + "SimpleNetworkInterface.sol",
      "utf8"
    ),
  },
  "Utils.sol": {
    content: fs.readFileSync(contractsSol4Path + "Utils.sol", "utf8"),
  },
  "Utils2.sol": {
    content: fs.readFileSync(contractsSol4Path + "Utils2.sol", "utf8"),
  },
  "Utils3.sol": {
    content: fs.readFileSync(contractsSol4Path + "Utils3.sol", "utf8"),
  },
  "Withdrawable.sol": {
    content: fs.readFileSync(contractsSol4Path + "Withdrawable.sol", "utf8"),
  },
  "KyberUniswapReserve.sol": {
    content: fs.readFileSync(
      contractsSol4Path +
        "reserves/bridgeReserves/uniswap/KyberUniswapReserve.sol",
      "utf8"
    ),
  },
  "WrapperBase.sol": {
    content: fs.readFileSync(
      contractsSol4Path + "wrappers/WrapperBase.sol",
      "utf8"
    ),
  },
  "SetStepFunctionWrapper.sol": {
    content: fs.readFileSync(
      contractsSol4Path + "wrappers/SetStepFunctionWrapper.sol",
      "utf8"
    ),
  },
  "WrapConversionRate.sol": {
    content: fs.readFileSync(
      contractsSol4Path + "wrappers/WrapConversionRate.sol",
      "utf8"
    ),
  },
  "WrapReadTokenData.sol": {
    content: fs.readFileSync(
      contractsSol4Path + "wrappers/WrapReadTokenData.sol",
      "utf8"
    ),
  },
};

const sol5SourceFiles = {
  "Eth2DaiReserve.sol": {
    content: fs.readFileSync(contractsSol5Path + "/bridges/eth2dai/Eth2DaiReserve.sol", "utf8"),
  },
  "IBancorNetwork.sol": {
    content: fs.readFileSync(contractsSol5Path + "/bridges/bancor/mock/IBancorNetwork.sol", "utf8"),
  },
  "IERC20.sol": {
    content: fs.readFileSync(contractsSol5Path + "IERC20.sol", "utf8"),
  },
  "IKyberReserve.sol": {
    content: fs.readFileSync(contractsSol5Path + "IKyberReserve.sol", "utf8"),
  },
  "IOtc.sol": {
    content: fs.readFileSync(contractsSol5Path + "/bridges/eth2dai/mock/IOtc.sol", "utf8"),
  },
  "KyberBancorReserve.sol": {
    content: fs.readFileSync(contractsSol5Path + "/bridges/bancor/KyberBancorReserve.sol", "utf8"),
  },
  "mock/IBancorNetwork.sol": {
    content: fs.readFileSync(contractsSol5Path + "/bridges/bancor/mock/IBancorNetwork.sol", "utf8"),
  },
  "mock/IOtc.sol": {
    content: fs.readFileSync(contractsSol5Path + "/bridges/eth2dai/mock/IOtc.sol", "utf8"),
  },
  "mock/Token.sol": {
    content: fs.readFileSync(contractsSol5Path + "/mock/Token.sol", "utf8"),
  },
  "MockBancorNetwork.sol": {
    content: fs.readFileSync(contractsSol5Path + "/bridges/bancor/mock/MockBancorNetwork.sol", "utf8"),
  },
  "MockOtcOrderbook.sol": {
    content: fs.readFileSync(contractsSol5Path + "/bridges/eth2dai/mock/MockOtcOrderbook.sol", "utf8"),
  },
  "PermissionGroups2.sol": {
    content: fs.readFileSync(
      contractsSol5Path + "utils/PermissionGroups2.sol",
      "utf8"
    ),
  },
  "utils/PermissionGroups2.sol": {
    content: fs.readFileSync(
      contractsSol5Path + "utils/PermissionGroups2.sol",
      "utf8"
    ),
  },
  "utils/Utils4.sol": {
    content: fs.readFileSync(contractsSol5Path + "utils/Utils4.sol", "utf8"),
  },
  "utils/Withdrawable2.sol": {
    content: fs.readFileSync(
      contractsSol5Path + "utils/Withdrawable2.sol",
      "utf8"
    ),
  },
  "Utils4.sol": {
    content: fs.readFileSync(contractsSol5Path + "utils/Utils4.sol", "utf8"),
  },
  "WethToken.sol": {
    content: fs.readFileSync(contractsSol5Path + "/bridges/eth2dai/mock/WethToken.sol", "utf8"),
  },
  "Withdrawable2.sol": {
    content: fs.readFileSync(
      contractsSol5Path + "utils/Withdrawable2.sol",
      "utf8"
    ),
  }
};

const sol6SourceFiles = {
  "Address.sol": {
    content: fs.readFileSync(
      contractsSol6Path + "utils/zeppelin/Address.sol",
      "utf8"
    ),
  },
  "EpochUtils.sol": {
    content: fs.readFileSync(contractsSol6Path + "Dao/EpochUtils.sol", "utf8"),
  },
  "GasHelper.sol": {
    content: fs.readFileSync(contractsSol6Path + "mock/GasHelper.sol", "utf8"),
  },
  "IGasHelper.sol": {
    content: fs.readFileSync(contractsSol6Path + "IGasHelper.sol", "utf8"),
  },
  "IERC20.sol": {
    content: fs.readFileSync(contractsSol6Path + "IERC20.sol", "utf8"),
  },
  "IBurnableToken.sol": {
    content: fs.readFileSync(contractsSol6Path + "IBurnableToken.sol", "utf8"),
  },
  "IKyberFeeHandler.sol": {
    content: fs.readFileSync(
      contractsSol6Path + "IKyberFeeHandler.sol",
      "utf8"
    ),
  },
  "IKyberDAO.sol": {
    content: fs.readFileSync(contractsSol6Path + "IKyberDAO.sol", "utf8"),
  },
  "IKyberHint.sol": {
    content: fs.readFileSync(contractsSol6Path + "IKyberHint.sol", "utf8"),
  },
  "IKyberNetwork.sol": {
    content: fs.readFileSync(contractsSol6Path + "IKyberNetwork.sol", "utf8"),
  },
  "IKyberNetworkProxy.sol": {
    content: fs.readFileSync(
      contractsSol6Path + "IKyberNetworkProxy.sol",
      "utf8"
    ),
  },
  "IKyberRateHelper.sol": {
    content: fs.readFileSync(
      contractsSol6Path + "IKyberRateHelper.sol",
      "utf8"
    ),
  },
  "IKyberReserve.sol": {
    content: fs.readFileSync(contractsSol6Path + "IKyberReserve.sol", "utf8"),
  },
  "IKyberMatchingEngine.sol": {
    content: fs.readFileSync(
      contractsSol6Path + "IKyberMatchingEngine.sol",
      "utf8"
    ),
  },
  "IKyberStaking.sol": {
    content: fs.readFileSync(
      contractsSol6Path + "Dao/IKyberStaking.sol",
      "utf8"
    ),
  },
  "IKyberStorage.sol": {
    content: fs.readFileSync(
      contractsSol6Path + "IKyberStorage.sol",
      "utf8"
    ),
  },
  "ISanityRate.sol": {
    content: fs.readFileSync(
      contractsSol6Path + "ISanityRate.sol",
      "utf8"
    ),
  },
  "ISimpleKyberProxy.sol": {
    content: fs.readFileSync(
      contractsSol6Path + "ISimpleKyberProxy.sol",
      "utf8"
    ),
  },
  "KyberDAO.sol": {
    content: fs.readFileSync(contractsSol6Path + "Dao/KyberDAO.sol", "utf8"),
  },
  "KyberFeeHandler.sol": {
    content: fs.readFileSync(
      contractsSol6Path + "Dao/KyberFeeHandler.sol",
      "utf8"
    ),
  },
  "KyberHintHandler.sol": {
    content: fs.readFileSync(
      contractsSol6Path + "KyberHintHandler.sol",
      "utf8"
    ),
  },
  "KyberNetwork.sol": {
    content: fs.readFileSync(contractsSol6Path + "KyberNetwork.sol", "utf8"),
  },
  "KyberNetworkProxy.sol": {
    content: fs.readFileSync(
      contractsSol6Path + "KyberNetworkProxy.sol",
      "utf8"
    ),
  },
  "KyberMatchingEngine.sol": {
    content: fs.readFileSync(
      contractsSol6Path + "KyberMatchingEngine.sol",
      "utf8"
    ),
  },
  "KyberStaking.sol": {
    content: fs.readFileSync(
      contractsSol6Path + "Dao/KyberStaking.sol",
      "utf8"
    ),
  },
  "KyberStorage.sol": {
    content: fs.readFileSync(
      contractsSol6Path + "KyberStorage.sol",
      "utf8"
    ),
  },
  "PermissionGroupsNoModifiers.sol": {
    content: fs.readFileSync(
      contractsSol6Path + "utils/PermissionGroupsNoModifiers.sol",
      "utf8"
    ),
  },
  "ReentrancyGuard.sol": {
    content: fs.readFileSync(
      contractsSol6Path + "utils/zeppelin/ReentrancyGuard.sol",
      "utf8"
    ),
  },
  "SafeERC20.sol": {
    content: fs.readFileSync(
      contractsSol6Path + "utils/zeppelin/SafeERC20.sol",
      "utf8"
    ),
  },
  "SafeMath.sol": {
    content: fs.readFileSync(
      contractsSol6Path + "utils/zeppelin/SafeMath.sol",
      "utf8"
    ),
  },
  "utils/zeppelin/Address.sol": {
    content: fs.readFileSync(
      contractsSol6Path + "utils/zeppelin/Address.sol",
      "utf8"
    ),
  },
  "utils/PermissionGroupsNoModifiers.sol": {
    content: fs.readFileSync(
      contractsSol6Path + "utils/PermissionGroupsNoModifiers.sol",
      "utf8"
    ),
  },
  "utils/Utils5.sol": {
    content: fs.readFileSync(contractsSol6Path + "utils/Utils5.sol", "utf8"),
  },
  "utils/WithdrawableNoModifiers.sol": {
    content: fs.readFileSync(
      contractsSol6Path + "utils/WithdrawableNoModifiers.sol",
      "utf8"
    ),
  },
  "utils/zeppelin/SafeERC20.sol": {
    content: fs.readFileSync(
      contractsSol6Path + "utils/zeppelin/SafeERC20.sol",
      "utf8"
    ),
  },
  "utils/zeppelin/SafeMath.sol": {
    content: fs.readFileSync(
      contractsSol6Path + "utils/zeppelin/SafeMath.sol",
      "utf8"
    ),
  },
  "utils/zeppelin/ReentrancyGuard.sol": {
    content: fs.readFileSync(
      contractsSol6Path + "utils/zeppelin/ReentrancyGuard.sol",
      "utf8"
    ),
  },
  "Utils5.sol": {
    content: fs.readFileSync(contractsSol6Path + "utils/Utils5.sol", "utf8"),
  },
  "WithdrawableNoModifiers.sol": {
    content: fs.readFileSync(
      contractsSol6Path + "utils/WithdrawableNoModifiers.sol",
      "utf8"
    ),
  }
};

function compilingPreparations() {
  const buildPath = path.resolve(__dirname, "build");
  fs.removeSync(buildPath);
  return buildPath;
}

function createConfiguration(sourceFiles) {
  return {
    language: "Solidity",
    sources: sourceFiles,
    settings: {
      outputSelection: {
        // return everything
        "*": {
          "*": ["*"],
        },
      },
      // Optional: Optimizer settings
      optimizer: require("../solcOptimiserSettings.js"),
    },
  };
}

function getImports(dependency) {
  console.log("Searching for dependency: ", dependency);
}

function loadSpecificCompiler(solcVersion, solcPath) {
  console.log(`Loading compiler ${solcVersion}`);
  return solc.setupMethods(require(solcPath));
}

function errorHandling(compiledSources, versionNum) {
  if (!compiledSources) {
    console.error(
      ">>>>>>>>>>>>>>>>>>>>>>>> ERRORS <<<<<<<<<<<<<<<<<<<<<<<<\n",
      "NO OUTPUT"
    );
  } else if (compiledSources.errors) {
    // something went wrong.
    console.error(">>>>>>>>>>>>>>>>>>>>>>>> ERRORS <<<<<<<<<<<<<<<<<<<<<<<<\n");
    compiledSources.errors.map((error) => console.log(error.formattedMessage));
  } else {
    console.log(`Successfully compiled ${versionNum} contracts!`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

module.exports.compileContracts = compileContracts;
async function compileContracts(versionNum) {
  compiler = undefined;
  let solcVersionNum;
  let solcPath;
  let sourceFiles;
  if (versionNum == "sol4") {
    solcVersionNum = solc418;
    solcPath = solc418Path;
    sourceFiles = sol4SourceFiles;
  } else if (versionNum == "sol5") {
    solcVersionNum = solc511;
    solcPath = solc511Path;
    sourceFiles = sol5SourceFiles;
  } else if (versionNum == "sol6") {
    solcVersionNum = solc66;
    solcPath = solc66Path;
    sourceFiles = sol6SourceFiles;
  } else {
    console.log(`invalid version number ${versionNum}`);
    process.exit(0);
  }

  compiler = loadSpecificCompiler(solcVersionNum, solcPath);
  compilingPreparations();
  const config = createConfiguration(sourceFiles);
  console.log("started compilation");
  output = JSON.parse(compiler.compile(JSON.stringify(config)));
  errorHandling(output, versionNum);
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

module.exports.compileSol6Contracts = compileSol6Contracts;
async function compileSol6Contracts() {
  return await compileContracts("sol6");
}

module.exports.compileAllContracts = main;
async function main() {
  let output = {contracts: {}, sources: {}};
  let v4Output = await compileContracts("sol4");
  let v5Output = await compileContracts("sol5");
  let v6Output = await compileContracts("sol6");
  return [v4Output, v5Output, v6Output];
}

main();
