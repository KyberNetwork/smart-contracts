pragma solidity 0.5.11;

import "../KyberMatchingEngine.sol";


/**
 *    @dev MockMatchEngine is a mock for testing overflow
 */

contract MockMatchEngine is KyberMatchingEngine {

    constructor(address _admin) public KyberMatchingEngine(_admin) {}

    function initAndValidateTradeData(
        uint256 srcDecimals,
        uint256 destDecimals,
        uint256[] memory info
    ) internal pure returns (TradeData memory tData) {
        tData.tokenToEth.decimals = srcDecimals;
        tData.ethToToken.decimals = destDecimals;
        tData.networkFeeBps = info[uint256(
            IKyberMatchingEngine.InfoIndex.networkFeeBps
        )];
        tData.platformFeeBps = info[uint256(
            IKyberMatchingEngine.InfoIndex.platformFeeBps
        )];
        return tData;
    }
}
