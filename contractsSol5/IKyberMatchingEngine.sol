
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
    }

    function getNegligibleRateDiffBps() external view returns (uint);

    function setNegligbleRateDiffBps(uint _negligibleRateDiffBps) external returns (bool);

    function setKyberStorage(IKyberStorage _kyberStorage) external returns (bool);

    function addReserve(bytes32 reserveId, ReserveType resType) external returns (bool);

    function removeReserve(bytes32 reserveId) external returns (bool);

    function getReserveDetailsByAddress(address reserve) external view
        returns(bytes32 reserveId, ReserveType resType, bool isFeeAccounted);

    function getReserveDetailsById(bytes32 reserveId) external view
        returns(address reserveAddress, ReserveType resType, bool isFeeAccounted);

    function getTradingReserves(IERC20 src, IERC20 dest, bool isTokenToToken, bytes calldata hint)
        external view
        returns(
            bytes32[] memory reserveIds,
            uint[] memory splitValuesBps,
            bool[] memory isFeeAccounted,
            ProcessWithRate processWithRate
        );

    function doMatch(
        IERC20 src,
        IERC20 dest,
        uint[] calldata srcAmounts,
        uint[] calldata feeAccountedBpsDest,
        uint[] calldata rates
        ) external view
        returns(uint[] memory reserveIndexes);
}
