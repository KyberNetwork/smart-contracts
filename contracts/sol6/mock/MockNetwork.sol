pragma solidity 0.6.6;

import "../KyberNetwork.sol";


// override some of original KyberNetwork contract
contract MockNetwork is KyberNetwork {
    constructor(address _admin, IKyberStorage _kyberStorage)
        public
        KyberNetwork(_admin, _kyberStorage)
    {}

    // allow set zero contract
    function setContracts(
        IKyberFeeHandler _kyberFeeHandler,
        IKyberMatchingEngine _kyberMatchingEngine,
        IGasHelper _gasHelper
    ) external override {
        if (kyberFeeHandler != _kyberFeeHandler) {
            kyberFeeHandler = _kyberFeeHandler;
            emit KyberFeeHandlerUpdated(_kyberFeeHandler);
        }

        if (kyberMatchingEngine != _kyberMatchingEngine) {
            kyberMatchingEngine = _kyberMatchingEngine;
            emit KyberMatchingEngineUpdated(_kyberMatchingEngine);
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
