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

    function mockGetNetworkFee() public view returns(uint networkFeeBps) {
        return getNetworkFee();
    }

    function mockHandleChange (IERC20 src, uint srcAmount, uint requiredSrcAmount, address payable trader) public returns (bool){
        return handleChange(src, srcAmount, requiredSrcAmount, trader);
    }

    // allow set zero contract
    function setContracts(IKyberFeeHandler _feeHandler,
        IKyberMatchingEngine _matchingEngine,
        IKyberStorage _storage,
        IGasHelper _gasHelper
    )
        external
    {
        if (feeHandler != _feeHandler) {
            feeHandler = _feeHandler;
            emit FeeHandlerUpdated(_feeHandler);
        }

        if (matchingEngine != _matchingEngine) {
            matchingEngine = _matchingEngine;
            emit MatchingEngineUpdated(_matchingEngine);
        }

        if (kyberStorage != _storage) {
            kyberStorage = _storage;
            emit KyberStorageUpdated(_storage);
        }

        if ((_gasHelper != IGasHelper(0)) && (_gasHelper != gasHelper)) {
            gasHelper = _gasHelper;
            emit GasHelperUpdated(_gasHelper);
        }
    }
}
