pragma solidity 0.4.18;


import "../ERC20Interface.sol";
import "../ConversionRates.sol";
import "./WrapperBase.sol";


contract WrapConversionRate is WrapperBase {

    ConversionRates internal conversionRates;

    //add token parameters
    struct AddTokenData {
        ERC20     token;
        uint      minimalResolution; // can be roughly 1 cent
        uint      maxPerBlockImbalance; // in twei resolution
        uint      maxTotalImbalance;
    }

    AddTokenData internal addTokenData;

    //set token control info parameters.
    struct TokenControlInfoData {
        ERC20[] tokens;
        uint[] perBlockImbalance; // in twei resolution
        uint[] maxTotalImbalance;
    }

    TokenControlInfoData internal tokenControlInfoData;

    //valid duration
    struct ValidDurationData {
        uint durationInBlocks;
    }

    ValidDurationData internal validDurationData;

    //data indexes
    uint constant internal ADD_TOKEN_DATA_INDEX = 0;
    uint constant internal TOKEN_INFO_DATA_INDEX = 1;
    uint constant internal VALID_DURATION_DATA_INDEX = 2;
    uint constant internal NUM_DATA_INDEX = 3;

    //general functions
    function WrapConversionRate(ConversionRates _conversionRates, address _admin) public
        WrapperBase(PermissionGroups(address(_conversionRates)), _admin, NUM_DATA_INDEX)
    {
        require(_conversionRates != address(0));
        conversionRates = _conversionRates;
    }

    // add token functions
    //////////////////////
    function setAddTokenData(
        ERC20 token,
        uint minRecordResolution,
        uint maxPerBlockImbalance,
        uint maxTotalImbalance
        ) public onlyOperator
    {
        require(token != address(0));
        require(minRecordResolution != 0);
        require(maxPerBlockImbalance != 0);
        require(maxTotalImbalance != 0);

        //update data tracking
        setNewData(ADD_TOKEN_DATA_INDEX);

        addTokenData.token = token;
        addTokenData.minimalResolution = minRecordResolution; // can be roughly 1 cent
        addTokenData.maxPerBlockImbalance = maxPerBlockImbalance; // in twei resolution
        addTokenData.maxTotalImbalance = maxTotalImbalance;
    }

    function approveAddTokenData(uint nonce) public onlyOperator {
        if (addSignature(ADD_TOKEN_DATA_INDEX, nonce, msg.sender)) {
            // can perform operation.
            performAddToken();
        }
    }

    function getAddTokenData() public view
        returns(uint nonce, ERC20 token, uint minRecordResolution, uint maxPerBlockImbalance, uint maxTotalImbalance)
    {
        address[] memory signatures;
        (signatures, nonce) = getDataTrackingParameters(ADD_TOKEN_DATA_INDEX);
        token = addTokenData.token;
        minRecordResolution = addTokenData.minimalResolution;
        maxPerBlockImbalance = addTokenData.maxPerBlockImbalance; // in twei resolution
        maxTotalImbalance = addTokenData.maxTotalImbalance;
        return(nonce, token, minRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
    }

    function getAddTokenSignatures() public view returns (address[] memory signatures) {
        uint nonce;
        (signatures, nonce) = getDataTrackingParameters(ADD_TOKEN_DATA_INDEX);
        return(signatures);
    }

    //set token control info
    ////////////////////////
    function setTokenInfoData(ERC20[] tokens, uint[] maxPerBlockImbalanceValues, uint[] maxTotalImbalanceValues)
        public
        onlyOperator
    {
        require(maxPerBlockImbalanceValues.length == tokens.length);
        require(maxTotalImbalanceValues.length == tokens.length);

        //update data tracking
        setNewData(TOKEN_INFO_DATA_INDEX);

        tokenControlInfoData.tokens = tokens;
        tokenControlInfoData.perBlockImbalance = maxPerBlockImbalanceValues;
        tokenControlInfoData.maxTotalImbalance = maxTotalImbalanceValues;
    }

    function approveTokenControlInfo(uint nonce) public onlyOperator {
        if (addSignature(TOKEN_INFO_DATA_INDEX, nonce, msg.sender)) {
            // can perform operation.
            performSetTokenControlInfo();
        }
    }

    function getControlInfoPerToken (uint index) public view
        returns(ERC20 token, uint _maxPerBlockImbalance, uint _maxTotalImbalance, uint nonce)
    {
        require(tokenControlInfoData.tokens.length > index);
        require(tokenControlInfoData.perBlockImbalance.length > index);
        require(tokenControlInfoData.maxTotalImbalance.length > index);
        address[] memory signatures;
        (signatures, nonce) = getDataTrackingParameters(TOKEN_INFO_DATA_INDEX);

        return(
            tokenControlInfoData.tokens[index],
            tokenControlInfoData.perBlockImbalance[index],
            tokenControlInfoData.maxTotalImbalance[index],
            nonce
        );
    }

    function getTokenInfoNumToknes() public view returns(uint numSetTokens) {
        return tokenControlInfoData.tokens.length;
    }

    function getTokenInfoData() public view
        returns(uint nonce, uint numSetTokens, ERC20[] tokenAddress, uint[] maxPerBlock, uint[] maxTotal)
    {
        address[] memory signatures;
        (signatures, nonce) = getDataTrackingParameters(TOKEN_INFO_DATA_INDEX);

        return(
            nonce,
            tokenControlInfoData.tokens.length,
            tokenControlInfoData.tokens,
            tokenControlInfoData.perBlockImbalance,
            tokenControlInfoData.maxTotalImbalance);
    }

    function getTokenInfoSignatures() public view returns (address[] memory signatures) {
        uint nonce;
        (signatures, nonce) = getDataTrackingParameters(TOKEN_INFO_DATA_INDEX);
        return(signatures);
    }

    function getTokenInfoNonce() public view returns(uint nonce) {
        address[] memory signatures;
        (signatures, nonce) = getDataTrackingParameters(TOKEN_INFO_DATA_INDEX);
        return nonce;
    }

    //valid duration blocks
    ///////////////////////
    function setValidDurationData(uint validDurationBlocks) public onlyOperator {
        require(validDurationBlocks > 5);

        //update data tracking
        setNewData(VALID_DURATION_DATA_INDEX);

        validDurationData.durationInBlocks = validDurationBlocks;
    }

    function approveValidDurationData(uint nonce) public onlyOperator {
        if (addSignature(VALID_DURATION_DATA_INDEX, nonce, msg.sender)) {
            // can perform operation.
            conversionRates.setValidRateDurationInBlocks(validDurationData.durationInBlocks);
        }
    }

    function getValidDurationBlocksData() public view returns(uint validDuration, uint nonce) {
        address[] memory signatures;
        (signatures, nonce) = getDataTrackingParameters(VALID_DURATION_DATA_INDEX);
        return(nonce, validDurationData.durationInBlocks);
    }

    function getValidDurationSignatures() public view returns (address[] memory signatures) {
        uint nonce;
        (signatures, nonce) = getDataTrackingParameters(VALID_DURATION_DATA_INDEX);
        return(signatures);
    }

    function performAddToken() internal {
        conversionRates.addToken(addTokenData.token);

        conversionRates.addOperator(this);

        //token control info
        conversionRates.setTokenControlInfo(
            addTokenData.token,
            addTokenData.minimalResolution,
            addTokenData.maxPerBlockImbalance,
            addTokenData.maxTotalImbalance
        );

        //step functions
        int[] memory zeroArr = new int[](1);
        zeroArr[0] = 0;

        conversionRates.setQtyStepFunction(addTokenData.token, zeroArr, zeroArr, zeroArr, zeroArr);
        conversionRates.setImbalanceStepFunction(addTokenData.token, zeroArr, zeroArr, zeroArr, zeroArr);

        conversionRates.enableTokenTrade(addTokenData.token);

        conversionRates.removeOperator(this);
    }

    function performSetTokenControlInfo() internal {
        require(tokenControlInfoData.tokens.length == tokenControlInfoData.perBlockImbalance.length);
        require(tokenControlInfoData.tokens.length == tokenControlInfoData.maxTotalImbalance.length);

        uint minRecordResolution;

        for (uint i = 0; i < tokenControlInfoData.tokens.length; i++) {
            uint maxPerBlock;
            uint maxTotal;
            (minRecordResolution, maxPerBlock, maxTotal) =
                conversionRates.getTokenControlInfo(tokenControlInfoData.tokens[i]);
            require(minRecordResolution != 0);

            conversionRates.setTokenControlInfo(tokenControlInfoData.tokens[i],
                minRecordResolution,
                tokenControlInfoData.perBlockImbalance[i],
                tokenControlInfoData.maxTotalImbalance[i]);
        }
    }
}

