pragma solidity 0.5.11;

import "../KyberNetwork.sol";

// override some of original KyberNetwork contract
contract MockNetwork is KyberNetwork {

    constructor(address _admin) public KyberNetwork(_admin)
        {}

    //over ride some functions to reduce contract size.
    function doReserveTrades(
        IERC20 src,
        uint amount,
        IERC20 dest,
        address payable destAddress,
        TradeData memory tradeData,
        uint expectedDestAmount
    )
        internal
        returns(bool)
    {
        src;
        amount;
        dest;
        destAddress;
        tradeData;
        expectedDestAmount;

        revert("must use real network");
        // return true;
    }

    function setNetworkFeeData(uint _networkFeeBps, uint _expiryBlock) public {
        updateNetworkFee(_expiryBlock, _networkFeeBps);
    }

    function getNetworkFeeData() public view returns(uint _networkFeeBps, uint _expiryBlock) {
        (_networkFeeBps, _expiryBlock) = readNetworkFeeData();
    }

    // allow set zero contract
    function setContracts(IKyberFeeHandler _feeHandler,
        IKyberMatchingEngine _matchingEngine,
        IGasHelper _gasHelper
    )
        external onlyAdmin
    {
        // require(_feeHandler != IKyberFeeHandler(0), "feeHandler 0");
        // require(_matchingEngine != IKyberMatchingEngine(0), "matchingEngine 0");

        if ((feeHandler.length == 0) || (_feeHandler != feeHandler[0])) {

            if (feeHandler.length > 0) {
                feeHandler.push(feeHandler[0]);
                feeHandler[0] = _feeHandler;
            } else {
                feeHandler.push(_feeHandler);
            }

            emit FeeHandlerUpdated(_feeHandler);
        }

        if (matchingEngine.length == 0 || _matchingEngine != matchingEngine[0]) {
            if (matchingEngine.length > 0) {
                matchingEngine.push(matchingEngine[0]);
                matchingEngine[0] = _matchingEngine;
            } else {
                matchingEngine.push(_matchingEngine);
            }

            emit MatchingEngineUpdated(_matchingEngine);
        }

        if ((_gasHelper != IGasHelper(0)) && (_gasHelper != gasHelper)) {
            emit GasHelperUpdated(_gasHelper);
            gasHelper = _gasHelper;
        }
    }
}
