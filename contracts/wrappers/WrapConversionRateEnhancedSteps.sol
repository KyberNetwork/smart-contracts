pragma solidity 0.4.18;

import "./WrapConversionRate.sol";


contract WrapConversionRateEnhancedSteps is WrapConversionRate {

    //general functions
    function WrapConversionRateEnhancedSteps(ConversionRates _conversionRates) public
        WrapConversionRate(_conversionRates)
    { /* empty block */ }

    function addToken(
        ERC20 token,
        uint minRecordResolution,
        uint maxPerBlockImbalance,
        uint maxTotalImbalance
        ) public onlyAdmin
    {
        require(token != address(0));
        require(minRecordResolution != 0);
        require(maxPerBlockImbalance != 0);
        require(maxTotalImbalance != 0);

        conversionRates.addToken(token);

        //token control info
        conversionRates.setTokenControlInfo(
            token,
            minRecordResolution,
            maxPerBlockImbalance,
            maxTotalImbalance
        );

        //step functions
        int[] memory emptyArr = new int[](0);
        int[] memory zeroArr = new int[](1);
        zeroArr[0] = 0;

        conversionRates.setImbalanceStepFunction(token, emptyArr, zeroArr, emptyArr, zeroArr);

        conversionRates.enableTokenTrade(token);
    }
}
