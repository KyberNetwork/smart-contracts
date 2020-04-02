
pragma  solidity 0.5.11;

import "./IKyberReserve.sol";
import "./IKyberNetwork.sol";
import "./IKyberStorage.sol";


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

    enum ProcessWithRate {
        NotRequired,
        Required
        /* any other process type? */
    }

    function negligibleRateDiffBps() external view returns (uint);

    function setNegligbleRateDiffBps(uint _negligibleRateDiffBps) external returns (bool);

    function setKyberStorage(IKyberStorage _kyberStorage) external returns (bool);

    function addReserve(bytes8 reserveId, ReserveType resType) external returns (bool);

    function removeReserve(bytes8 reserveId) external returns (bool);

    function listPairForReserve(IKyberReserve reserve, IERC20 token, bool ethToToken, bool tokenToEth, bool add)
        external
        returns (bool);

    function getReserveDetails(address reserve) external view
        returns(bytes8 reserveId, ReserveType resType, bool isFeePaying);

    function getReservesPerTokenSrc(IERC20 token) external view returns(bytes8[] memory reserves);
    function getReservesPerTokenDest(IERC20 token) external view returns(bytes8[] memory reserves);

    function getReserveList(IERC20 src, IERC20 dest, bool isTokenToToken, bytes calldata hint)
        external view
        returns(
            bytes8[] memory reserveIds,
            uint[] memory splitValuesBps,
            bool[] memory isFeeAccounted,
            ProcessWithRate processWithRate
        );

    function doMatch(
        IERC20 src,
        IERC20 dest,
        uint[] calldata srcAmounts,
        uint[] calldata feeAccountedBps, // 0 for no fee. networkFeeBps when has fee
        uint[] calldata rates
        ) external view
        returns(uint[] memory reserveIndexes);
}
