pragma solidity 0.5.11;

import "../KyberNetwork.sol";


// override some of original KyberNetwork contract
contract MockNetwork is KyberNetwork {
    constructor(address _admin, IKyberStorage _kyberStorage)
        public
        KyberNetwork(_admin, _kyberStorage)
    {}

    // allow set zero contract
    function setContracts(
        IKyberFeeHandler _feeHandler,
        IKyberMatchingEngine _matchingEngine,
        IGasHelper _gasHelper
    ) external {
        if (feeHandler != _feeHandler) {
            feeHandler = _feeHandler;
            emit FeeHandlerUpdated(_feeHandler);
        }

        if (matchingEngine != _matchingEngine) {
            matchingEngine = _matchingEngine;
            emit MatchingEngineUpdated(_matchingEngine);
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
    ) public returns (bool) {
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
        uint256 amount,
        IERC20 dest,
        address payable destAddress,
        TradeData memory tradeData,
        uint256 expectedDestAmount
    ) internal returns (bool) {
        src;
        amount;
        dest;
        destAddress;
        tradeData;
        expectedDestAmount;

        revert("must use real network");
        // return true;
    }
}
