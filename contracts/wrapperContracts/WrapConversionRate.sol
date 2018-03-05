pragma solidity 0.4.18;


import "../ERC20Interface.sol";
import "../Withdrawable.sol";
import "../ConversionRatesInterface.sol";
import "./WrapperBase.sol";


contract WrapConversionRate is WrapperBase {

    ConversionRatesInterface conversionRates;

    //add token parameters
    ERC20     addTokenToken;
    uint      addTokenMinimalResolution; // can be roughly 1 cent
    uint      addTokenMaxPerBlockImbalance; // in twei resolution
    uint      addTokenMaxTotalImbalance;
    uint      addTokenDataIndex;

    //set token control info parameters.
    ERC20[]     tokenInfoTokenList;
    uint[]      tokenInfoPerBlockImbalance; // in twei resolution
    uint[]      tokenInfoMaxTotalImbalance;
    uint        tokenInfoDataIndex;

    //general functions
    function WrapConversionRate(ConversionRatesInterface _conversionRates, address _admin) public
        WrapperBase(PermissionGroups(address(_conversionRates)), _admin)
    {
        require (_conversionRates != address(0));
        conversionRates = _conversionRates;
        addTokenDataIndex = addDataInstance();
        tokenInfoDataIndex = addDataInstance();
    }

    function getWrappedContract() public view returns (ConversionRatesInterface _conversionRates) {
        _conversionRates = conversionRates;
    }

    // add token functions
    //////////////////////
    function setAddTokenData(ERC20 token, uint minimalRecordResolution, uint maxPerBlockImbalance, uint maxTotalImbalance) public onlyOperator {
        require(minimalRecordResolution != 0);
        require(maxPerBlockImbalance != 0);
        require(maxTotalImbalance != 0);

        //update data tracking
        setNewData(addTokenDataIndex);

        addTokenToken = token;
        addTokenMinimalResolution = minimalRecordResolution; // can be roughly 1 cent
        addTokenMaxPerBlockImbalance = maxPerBlockImbalance; // in twei resolution
        addTokenMaxTotalImbalance = maxTotalImbalance;
    }

    function signToApproveAddTokenData(uint nonce) public onlyOperator {
        if(addSignature(addTokenDataIndex, nonce, msg.sender)) {
            // can perform operation.
            performAddToken();
        }
    }

    function performAddToken() internal {
        conversionRates.addToken(addTokenToken);

        //token control info
        conversionRates.setTokenControlInfo(
            addTokenToken,
            addTokenMinimalResolution,
            addTokenMaxPerBlockImbalance,
            addTokenMaxTotalImbalance
        );

        //step functions
        int[] memory zeroArr = new int[](1);
        zeroArr[0] = 0;

        conversionRates.setQtyStepFunction(addTokenToken, zeroArr, zeroArr, zeroArr, zeroArr);
        conversionRates.setImbalanceStepFunction(addTokenToken, zeroArr, zeroArr, zeroArr, zeroArr);

        conversionRates.enableTokenTrade(addTokenToken);
    }

    function getAddTokenParameters() public view
        returns(ERC20 token, uint minimalRecordResolution, uint maxPerBlockImbalance, uint maxTotalImbalance)
    {
        token = addTokenToken;
        minimalRecordResolution = addTokenMinimalResolution;
        maxPerBlockImbalance = addTokenMaxPerBlockImbalance; // in twei resolution
        maxTotalImbalance = addTokenMaxTotalImbalance;
    }

    function getAddTokenSignatures() public view returns (address[] signatures) {
        uint nonce;
        (signatures, nonce) = getDataTrackingParameters(addTokenDataIndex);
        return(signatures);
    }

    function getAddTokenNonce() public view returns (uint nonce) {
        address[] memory signatures;
        (signatures, nonce) = getDataTrackingParameters(addTokenDataIndex);
        return(nonce);
    }

    //set token control info
    ////////////////////////
    function setTokenInfoData(ERC20 [] tokens, uint[] maxPerBlockImbalanceValues, uint[] maxTotalImbalanceValues)
        public
        onlyOperator
    {
        require(maxPerBlockImbalanceValues.length == tokens.length);
        require(maxTotalImbalanceValues.length == tokens.length);

        //update data tracking
        setNewData(tokenInfoDataIndex);

        tokenInfoTokenList = tokens;
        tokenInfoPerBlockImbalance = maxPerBlockImbalanceValues;
        tokenInfoMaxTotalImbalance = maxTotalImbalanceValues;
    }

    function signToApproveTokenControlInfo(uint nonce) public onlyOperator {
        if(addSignature(tokenInfoDataIndex, nonce, msg.sender)) {
            // can perform operation.
            performSetTokenControlInfo();
        }
    }

    function performSetTokenControlInfo() internal {
        require(tokenInfoTokenList.length == tokenInfoPerBlockImbalance.length);
        require(tokenInfoTokenList.length == tokenInfoMaxTotalImbalance.length);

        uint minimalRecordResolution;
        uint rxMaxPerBlockImbalance;
        uint rxMaxTotalImbalance;

        for (uint i = 0; i < tokenInfoTokenList.length; i++) {
            (minimalRecordResolution, rxMaxPerBlockImbalance, rxMaxTotalImbalance) =
                conversionRates.getTokenControlInfo(tokenInfoTokenList[i]);
            require(minimalRecordResolution != 0);

            conversionRates.setTokenControlInfo(tokenInfoTokenList[i],
                                                minimalRecordResolution,
                                                tokenInfoPerBlockImbalance[i],
                                                tokenInfoMaxTotalImbalance[i]);
        }
    }

    function getControlInfoPerToken (uint index) public view returns(ERC20 token, uint _maxPerBlockImbalance, uint _maxTotalImbalance) {
        require (tokenInfoTokenList.length > index);
        require (tokenInfoPerBlockImbalance.length > index);
        require (tokenInfoMaxTotalImbalance.length > index);

        return(tokenInfoTokenList[index], tokenInfoPerBlockImbalance[index], tokenInfoMaxTotalImbalance[index]);
    }

    function getTokenInfoData() public view returns(ERC20[], uint[], uint[]) {
        return(tokenInfoTokenList, tokenInfoPerBlockImbalance, tokenInfoMaxTotalImbalance);
    }

//    function getTokenInfoTokenList() public view returns(ERC20[] tokens) {
//        return(tokenInfoTokenList);
//    }
//
//    function getTokenInfoMaxPerBlockImbalanceList() public view returns(uint[] maxPerBlockImbalanceValues) {
//        return (tokenInfoPerBlockImbalance);
//    }
//
//    function getTokenInfoMaxTotalImbalanceList() public view returns(uint[] maxTotalImbalanceValues) {
//        return(tokenInfoMaxTotalImbalance);
//    }

    function getTokenInfoSignatures() public view returns (address[] signatures) {
        uint nonce;
        (signatures, nonce) = getDataTrackingParameters(tokenInfoDataIndex);
        return(signatures);
    }

    function getTokenInfoNonce() public view returns(uint nonce) {
        address[] memory signatures;
        (signatures, nonce) = getDataTrackingParameters(tokenInfoDataIndex);
        return nonce;
    }
}

