pragma solidity 0.6.6;

import "../nimbleNetwork.sol";


// override some of original nimbleNetwork contract
contract MockNetwork is nimbleNetwork {
    constructor(address _admin, InimbleStorage _nimbleStorage)
        public
        nimbleNetwork(_admin, _nimbleStorage)
    {}

    // allow set zero contract
    function setContracts(
        InimbleFeeHandler _nimbleFeeHandler,
        InimbleMatchingEngine _nimbleMatchingEngine,
        IGasHelper _gasHelper
    ) external override {
        if (nimbleFeeHandler != _nimbleFeeHandler) {
            nimbleFeeHandler = _nimbleFeeHandler;
            emit nimbleFeeHandlerUpdated(_nimbleFeeHandler);
        }

        if (nimbleMatchingEngine != _nimbleMatchingEngine) {
            nimbleMatchingEngine = _nimbleMatchingEngine;
            emit nimbleMatchingEngineUpdated(_nimbleMatchingEngine);
        }

        if ((_gasHelper != IGasHelper(0)) && (_gasHelper != gasHelper)) {
            gasHelper = _gasHelper;
            emit GasHelperUpdated(_gasHelper);
        }
    }

    function mockHandleChange(
        IERC20 src,
        uint256 srcAmount,
        uint256 requiredSrcAmount,
        address payable trader
    ) public {
        return handleChange(src, srcAmount, requiredSrcAmount, trader);
    }

    function setNetworkFeeData(uint256 _networkFeeBps, uint256 _expiryTimestamp) public {
        updateNetworkFee(_expiryTimestamp, _networkFeeBps);
    }

    function getNetworkFeeData()
        public
        view
        returns (uint256 _networkFeeBps, uint256 _expiryTimestamp)
    {
        (_networkFeeBps, _expiryTimestamp) = readNetworkFeeData();
    }

    function mockGetNetworkFee() public view returns (uint256 networkFeeBps) {
        return getNetworkFee();
    }

    //over ride some functions to reduce contract size.
    function doReserveTrades(
        IERC20 src,
        IERC20 dest,
        address payable destAddress,
        ReservesData memory reservesData,
        uint256 expectedDestAmount,
        uint256 srcDecimals,
        uint256 destDecimals
    ) internal override {
        src;
        dest;
        destAddress;
        reservesData;
        expectedDestAmount;
        srcDecimals;
        destDecimals;

        revert("must use real network");
        // return true;
    }
}
