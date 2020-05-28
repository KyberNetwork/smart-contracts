pragma solidity 0.6.6;

import "../IKyberMatchingEngine.sol";
import "../utils/Utils5.sol";

contract MaliciousMatchingEngine is Utils5 {
    IKyberStorage public kyberStorage;
    uint256 splitLength;
    bool badValues;

    function setKyberStorage(IKyberStorage _kyberStorage) external {
        kyberStorage = _kyberStorage;
    }

    function setSplitLength(uint length) external {
        splitLength = length;
    }

    function setBadValues(bool shouldSetBadValues) external {
        badValues = shouldSetBadValues;
    }

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
            IKyberMatchingEngine.ProcessWithRate processWithRate
        )
    {
        isTokenToToken;
        hint;
        reserveIds = (dest == ETH_TOKEN_ADDRESS)
            ? kyberStorage.getReserveIdsPerTokenSrc(src)
            : kyberStorage.getReserveIdsPerTokenDest(dest);

        splitValuesBps = populateSplitValuesBps();
        processWithRate = IKyberMatchingEngine.ProcessWithRate.Required;
    }

    function doMatch(
        IERC20 src,
        IERC20 dest,
        uint256[] calldata srcAmounts,
        uint256[] calldata feesAccountedDestBps, // 0 for no fee, networkFeeBps when has fee
        uint256[] calldata rates
    ) external view returns (uint256[] memory reserveIndexes) {
        src;
        dest;
        srcAmounts;
        feesAccountedDestBps;
        rates;
        reserveIndexes = new uint256[](splitLength + 1);
    }

    function populateSplitValuesBps()
        internal
        view
        returns (uint256[] memory splitValuesBps)
    {
        splitValuesBps = new uint256[](splitLength);
        for (uint256 i = 0; i < splitLength; i++) {
            if (!badValues) {
                splitValuesBps[i] = BPS;
            }
        }
    }
}
