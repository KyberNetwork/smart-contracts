pragma solidity 0.4.18;


import "../ERC20Interface.sol";
import "./WrapperBase.sol";
import "../reserves/fprConversionRate/ConversionRates.sol";


contract WrapConversionRate is WrapperBase {

    ConversionRates internal conversionRates;

    //general functions
    function WrapConversionRate(ConversionRates _conversionRates) public
        WrapperBase(PermissionGroups(address(_conversionRates)))
    {
        conversionRates = _conversionRates;
    }

    //overriding base
    function claimWrappedContractAdmin() public onlyAdmin {
        super.claimWrappedContractAdmin();
        //for recurring claim, remove operator from wrapped contract
        conversionRates.addOperator(this);
    }

    // add token functions
    //////////////////////
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
        int[] memory zeroArr = new int[](1);
        zeroArr[0] = 0;

        conversionRates.setQtyStepFunction(token, zeroArr, zeroArr, zeroArr, zeroArr);
        conversionRates.setImbalanceStepFunction(token, zeroArr, zeroArr, zeroArr, zeroArr);

        conversionRates.enableTokenTrade(token);
    }

    // enable trade per token
    //////////////////////
    function enableTokenTrade(ERC20 token) public onlyAdmin {
        conversionRates.enableTokenTrade(token);
    }

    // set conversion rates reserve address
    //////////////////////
    function setReserveAddress(address reserve) public onlyAdmin {
        conversionRates.setReserveAddress(reserve);
    }

    //set token control info
    ////////////////////////
    function setTokenControlData(ERC20[] tokens, uint[] maxPerBlockImbalanceValues, uint[] maxTotalImbalanceValues)
        public
        onlyAdmin
    {
        require(maxPerBlockImbalanceValues.length == tokens.length);
        require(maxTotalImbalanceValues.length == tokens.length);

        uint minRecordResolution;

        for (uint i = 0; i < tokens.length; i++) {
            uint maxPerBlock;
            uint maxTotal;
            (minRecordResolution, maxPerBlock, maxTotal) =
            conversionRates.getTokenControlInfo(tokens[i]);
            require(minRecordResolution != 0);

            conversionRates.setTokenControlInfo(tokens[i],
                minRecordResolution,
                 maxPerBlockImbalanceValues[i],
                maxTotalImbalanceValues[i]);
        }
    }

    //set token min resolution
    ////////////////////////
    function setTokenMinResolution(ERC20[] tokens, uint[] minResolution) public onlyAdmin {
        require(minResolution.length == tokens.length);

        uint minRecordResolution;
        uint maxPerBlock;
        uint maxTotal;

        for (uint i = 0; i < tokens.length; i++) {
            (minRecordResolution, maxPerBlock, maxTotal) = conversionRates.getTokenControlInfo(tokens[i]);

            conversionRates.setTokenControlInfo(tokens[i],
                minResolution[i],
                maxPerBlock,
                maxTotal);
        }
    }

    //valid duration blocks
    ///////////////////////
    function setValidDurationData(uint validDurationBlocks) public onlyAdmin {
        require(validDurationBlocks > 5);
        conversionRates.setValidRateDurationInBlocks(validDurationBlocks);
    }
}
