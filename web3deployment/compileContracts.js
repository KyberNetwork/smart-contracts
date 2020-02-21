const fs = require("fs");
const path = require('path');
const solc = require('solc');

const contractPath = path.join(__dirname, "../contracts/");
const input = {
    "ConversionRates.sol" : fs.readFileSync(contractPath + 'reserves/fprConversionRate/ConversionRates.sol','utf8'),
    "ConversionRateEnhancedSteps.sol" : fs.readFileSync(contractPath + 'reserves/fprConversionRate/ConversionRateEnhancedSteps.sol', 'utf8'),
    "ConversionRatesInterface.sol" : fs.readFileSync(contractPath + 'ConversionRatesInterface.sol', 'utf8'),
    "reserves/fprConversionRate/ConversionRates.sol" : fs.readFileSync(contractPath + 'reserves/fprConversionRate/ConversionRates.sol','utf8'),
    "reserves/VolumeImbalanceRecorder.sol" : fs.readFileSync(contractPath + 'reserves/VolumeImbalanceRecorder.sol', 'utf8'),
    "VolumeImbalanceRecorder.sol" : fs.readFileSync(contractPath + 'reserves/VolumeImbalanceRecorder.sol', 'utf8'),
    "PermissionGroups.sol" : fs.readFileSync(contractPath + 'PermissionGroups.sol', 'utf8'),
    "ERC20Interface.sol" : fs.readFileSync(contractPath + 'ERC20Interface.sol', 'utf8'),
    "KyberNetworkOld.sol" : fs.readFileSync(contractPath + 'KyberNetworkOld.sol', 'utf8'),
    "KyberNetworkInterface.sol" : fs.readFileSync(contractPath + 'KyberNetworkInterface.sol', 'utf8'),
    "KyberProxyOld.sol" : fs.readFileSync(contractPath + 'KyberProxyOld.sol', 'utf8'),
    "KyberNetworkProxyInterface.sol" : fs.readFileSync(contractPath + 'KyberNetworkProxyInterface.sol','utf8'),
    "KyberReserve.sol" : fs.readFileSync(contractPath + 'reserves/KyberReserve.sol','utf8'),
    "KyberReserveInterface.sol" : fs.readFileSync(contractPath + 'KyberReserveInterface.sol','utf8'),
    "LiquidityConversionRates.sol": fs.readFileSync(contractPath + 'reserves/aprConversionRate/LiquidityConversionRates.sol','utf8'),
    "LiquidityFormula.sol": fs.readFileSync(contractPath + 'reserves/aprConversionRate/LiquidityFormula.sol','utf8'),
    "OrderbookReserve.sol" : fs.readFileSync(contractPath + 'reserves/orderBookReserve/permissionless/OrderbookReserve.sol', 'utf8'),
    "OrderbookReserveInterface.sol" : fs.readFileSync(contractPath + 'reserves/orderBookReserve/permissionless/OrderbookReserveInterface.sol', 'utf8'),
    "OrderIdManager.sol" : fs.readFileSync(contractPath + 'reserves/orderBookReserve/permissionless/OrderIdManager.sol', 'utf8'),
    "OrderList.sol" : fs.readFileSync(contractPath + 'reserves/orderBookReserve/permissionless/OrderList.sol', 'utf8'),
    "OrderListFactory.sol" : fs.readFileSync(contractPath + 'reserves/orderBookReserve/permissionless/OrderListFactory.sol', 'utf8'),
    "OrderListFactoryInterface.sol" : fs.readFileSync(contractPath + 'reserves/orderBookReserve/permissionless/OrderListFactoryInterface.sol', 'utf8'),
    "OrderListInterface.sol" : fs.readFileSync(contractPath + 'reserves/orderBookReserve/permissionless/OrderListInterface.sol', 'utf8'),
    "OrderListFactoryInterface.sol" : fs.readFileSync(contractPath + 'reserves/orderBookReserve/permissionless/OrderListFactoryInterface.sol', 'utf8'),
    "PermissionGroups.sol" : fs.readFileSync(contractPath + 'PermissionGroups.sol','utf8'),
    "KyberReserveInterface.sol" : fs.readFileSync(contractPath + 'KyberReserveInterface.sol', 'utf8'),
    "SanityRates.sol" : fs.readFileSync(contractPath + 'SanityRates.sol', 'utf8'),
    "SanityRatesInterface.sol" : fs.readFileSync(contractPath + 'SanityRatesInterface.sol', 'utf8'),
    "SimpleNetworkInterface.sol" : fs.readFileSync(contractPath + 'SimpleNetworkInterface.sol', 'utf8'),
    "Utils.sol" : fs.readFileSync(contractPath + 'Utils.sol', 'utf8'),
    "Utils2.sol" : fs.readFileSync(contractPath + 'Utils2.sol', 'utf8'),
    "Utils3.sol" : fs.readFileSync(contractPath + 'Utils3.sol', 'utf8'),
    "Withdrawable.sol" : fs.readFileSync(contractPath + 'Withdrawable.sol', 'utf8'),
    "KyberUniswapReserve.sol" : fs.readFileSync(contractPath + 'reserves/bridgeReserves/uniswap/KyberUniswapReserve.sol', 'utf8'),
    "WrapperBase.sol" : fs.readFileSync(contractPath + 'wrappers/WrapperBase.sol', 'utf8'),
    "SetStepFunctionWrapper.sol" : fs.readFileSync(contractPath + 'wrappers/SetStepFunctionWrapper.sol', 'utf8'),
    "WrapConversionRate.sol" : fs.readFileSync(contractPath + 'wrappers/WrapConversionRate.sol', 'utf8'),
    "WrapReadTokenData.sol" : fs.readFileSync(contractPath + 'wrappers/WrapReadTokenData.sol', 'utf8')
  };

module.exports.contracts = input;