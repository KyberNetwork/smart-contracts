pragma solidity 0.5.11;

import "./IKyberReserve.sol";
import "./IKyberNetwork.sol";
import "./IKyberStorage.sol";


interface IKyberMatchingEngine {
    enum ReserveType {NONE, FPR, APR, BRIDGE, UTILITY, CUSTOM, ORDERBOOK, LAST}

    enum ProcessWithRate {
        NotRequired,
        Required
        /* any other process type? */
    }

    function getNegligibleRateDiffBps() external view returns (uint256);

    function setNegligbleRateDiffBps(uint256 _negligibleRateDiffBps)
        external
        returns (bool);

    function setKyberStorage(IKyberStorage _kyberStorage)
        external
        returns (bool);

    function addReserve(bytes32 reserveId, ReserveType resType)
        external
        returns (bool);

    function removeReserve(bytes32 reserveId) external returns (bool);

    function getReserveDetailsByAddress(address reserve)
        external
        view
        returns (
            bytes32 reserveId,
            ReserveType resType,
            bool isFeePaying
        );

    function getReserveDetailsById(bytes32 reserveId)
        external
        view
        returns (
            address reserveAddress,
            ReserveType resType,
            bool isFeePaying
        );

    function getTradingReserves(
        IERC20 src,
        IERC20 dest,
        bool isTokenToToken,
        bytes calldata hint
    )
        external
        view
        returns (
            bytes32[] memory reserveIds,
            uint256[] memory splitValuesBps,
            bool[] memory isFeeAccounted,
            ProcessWithRate processWithRate
        );

    function doMatch(
        IERC20 src,
        IERC20 dest,
        uint256[] calldata srcAmounts,
        uint256[] calldata feeAccountedBps, // 0 for no fee. networkFeeBps when has fee
        uint256[] calldata rates
    ) external view returns (uint256[] memory reserveIndexes);
}
