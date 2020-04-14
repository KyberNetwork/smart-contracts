pragma solidity 0.5.11;

import "./IKyberReserve.sol";
import "./IKyberNetwork.sol";
import "./IKyberStorage.sol";

interface IKyberMatchingEngine {
    enum ProcessWithRate {NotRequired, Required}

    function getNegligibleRateDiffBps() external view returns (uint256);

    function setNegligbleRateDiffBps(uint256 _negligibleRateDiffBps)
        external
        returns (bool);

    function setKyberStorage(IKyberStorage _kyberStorage)
        external
        returns (bool);

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
        uint256[] calldata feeAccountedBpsDest,
        uint256[] calldata rates
    ) external view returns (uint256[] memory reserveIndexes);
}
