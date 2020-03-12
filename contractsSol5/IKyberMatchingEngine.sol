
pragma  solidity 0.5.11;

import "./IKyberReserve.sol";
import "./IKyberNetwork.sol";


interface IKyberMatchingEngine {

    enum ReserveType {
        NONE,
        FPR,
        APR,
        BRIDGE,
        UTILITY,
        CUSTOM,
        ORDERBOOK,
        LAST
    }

    enum ResultIndex {
        t2eNumReserves,
        tradeWei,
        numFeePayingReserves,
        feePayingReservesBps,
        destAmountNoFee,
        destAmountWithNetworkFee,
        actualDestAmount,
        resultLength
    }

    enum InfoIndex {
        srcAmount,
        networkFeeBps,
        platformFeeBps,
        infoLength
    }

    function negligibleRateDiffBps() external view returns (uint);

    function setNegligbleRateDiffBps(uint _negligibleRateDiffBps) external returns (bool);

    function addReserve(address reserve, bytes8 reserveId, ReserveType resType) external returns (bool);

    function removeReserve(address reserve) external returns (bytes8);

    function listPairForReserve(IKyberReserve reserve, IERC20 token, bool ethToToken, bool tokenToEth, bool add)
        external
        returns (bool);

    function calcRatesAndAmounts(IERC20 src, IERC20 dest, uint srcDecimals, uint destDecimals, uint[] calldata info, bytes calldata hint)
        external view
        returns (
            uint[] memory results,
            IKyberReserve[] memory reserveAddresses,
            uint[] memory rates,
            uint[] memory splitValuesBps,
            bool[] memory isFeePaying,
            bytes8[] memory ids
        );

    function getReserveDetails(address reserve) external view
        returns(bytes8 reserveId, ReserveType resType, bool isFeePaying);

    function getReservesPerTokenSrc(IERC20 token) external view returns(IKyberReserve[] memory reserves);
    function getReservesPerTokenDest(IERC20 token) external view returns(IKyberReserve[] memory reserves);
}
