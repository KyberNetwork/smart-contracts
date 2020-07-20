pragma solidity 0.6.6;

import "../IKyberMatchingEngine.sol";
import "./IKyberRateHelper.sol";
import "../IKyberDao.sol";
import "../IKyberStorage.sol";
import "../IKyberReserve.sol";
import "../utils/Utils5.sol";
import "../utils/WithdrawableNoModifiers.sol";


contract KyberRateHelper is IKyberRateHelper, WithdrawableNoModifiers, Utils5 {
    uint256 public constant DEFAULT_SPREAD_QUERY_AMOUNT_WEI = 10 ether;
    uint256 public constant DEFAULT_SLIPPAGE_QUERY_BASE_AMOUNT_WEI = 0.01 ether;
    uint256 public constant DEFAULT_SLIPPAGE_QUERY_AMOUNT_WEI = 10 ether;
    uint256 public constant DEFAULT_RATE_QUERY_AMOUNT_WEI = 1 ether;

    IKyberDao public kyberDao;
    IKyberStorage public kyberStorage;
    //reserves are queried directly
    bytes32[] public reserveIds;

    constructor(address _admin) public WithdrawableNoModifiers(_admin) {
        /* empty body */
    }

    event KyberDaoContractSet(IKyberDao kyberDao);
    event KyberStorageSet(IKyberStorage kyberStorage);
    event AddKyberReserve(bytes32 reserveId, bool add);

    function setContracts(
        IKyberDao _kyberDao,
        IKyberStorage _kyberStorage
    ) public {
        onlyAdmin();
        require(_kyberDao != IKyberDao(0), "kyberDao 0");
        require(_kyberStorage != IKyberStorage(0), "kyberStorage 0");

        if (kyberDao != _kyberDao) {
            kyberDao = _kyberDao;
            emit KyberDaoContractSet(_kyberDao);
        }

        if (kyberStorage != _kyberStorage) {
            kyberStorage = _kyberStorage;
            emit KyberStorageSet(_kyberStorage);
        }
    }

    function addReserve(bytes32 reserveId) public {
        onlyAdmin();
        require(reserveId != bytes32(0), "reserve 0");
        reserveIds.push(reserveId);

        emit AddKyberReserve(reserveId, true);
    }

    function removeReserve(bytes32 reserveId) public {
        onlyAdmin();
        for (uint256 i = 0; i < reserveIds.length; i++) {
            if (reserveIds[i] == reserveId) {
                reserveIds[i] = reserveIds[reserveIds.length - 1];
                reserveIds.pop();

                emit AddKyberReserve(reserveId, false);
                break;
            }
        }
    }

    function getPricesForToken(
        IERC20 token,
        uint256 optionalBuyAmountWei,
        uint256 optionalSellAmountTwei
    )
        public
        view
        override
        returns (
            bytes32[] memory buyReserves,
            uint256[] memory buyRates,
            bytes32[] memory sellReserves,
            uint256[] memory sellRates
        )
    {
        return getRatesForTokenWithCustomFee(token, optionalBuyAmountWei, optionalSellAmountTwei, 0);
    }

    /// @dev function to cover backward compatible with old network interface
    /// @dev get rate from eth to token, use the best token amount to get rate from token to eth
    /// @param token Token to get rate
    /// @param optionalAmountWei Eth amount to get rate (default: 0)
    function getReservesRates(IERC20 token, uint256 optionalAmountWei)
        public
        override
        view
        returns (
            bytes32[] memory buyReserves,
            uint256[] memory buyRates,
            bytes32[] memory sellReserves,
            uint256[] memory sellRates
        )
    {
        (uint256 networkFeeBps, ) = kyberDao.getLatestNetworkFeeData();
        uint256 buyAmountWei = optionalAmountWei > 0 ? optionalAmountWei : DEFAULT_RATE_QUERY_AMOUNT_WEI;

        (buyReserves, buyRates) = getBuyInfo(token, buyAmountWei, networkFeeBps);

        uint256 bestRate = 0;
        for (uint256 i = 0; i < buyRates.length; i++) {
            if (buyRates[i] > bestRate) {
                bestRate = buyRates[i];
            }
        }

        if (bestRate == 0) {
            return (buyReserves, buyRates, sellReserves, sellRates);
        }
        uint256 sellAmountTwei = calcDstQty(buyAmountWei, ETH_DECIMALS, getDecimals(token), bestRate);
        (sellReserves, sellRates) = getSellInfo(token, sellAmountTwei, networkFeeBps);
    }

    function getReservesRatesWithConfigReserves(IERC20 token, uint256 optionalAmountWei)
        public
        view
        returns (
            bytes32[] memory reserves,
            uint256[] memory buyRates,
            uint256[] memory sellRates
        )
    {
        (uint256 networkFeeBps, ) = kyberDao.getLatestNetworkFeeData();
        uint256 buyAmountWei = optionalAmountWei > 0 ? optionalAmountWei : DEFAULT_RATE_QUERY_AMOUNT_WEI;
        reserves = reserveIds;
        buyRates = getBuyRate(token, buyAmountWei, networkFeeBps, reserves);

        uint256 bestRate = 0;
        for (uint256 i = 0; i < buyRates.length; i++) {
            if (buyRates[i] > bestRate) {
                bestRate = buyRates[i];
            }
        }

        if (bestRate == 0) {
            sellRates = new uint256[](reserves.length);
            return (reserves, buyRates, sellRates);
        }
        uint256 sellAmountTwei = calcDstQty(buyAmountWei, ETH_DECIMALS, getDecimals(token), bestRate);
        sellRates = getSellRate(token, sellAmountTwei, networkFeeBps, reserves);
    }

    function getRatesForToken(
        IERC20 token,
        uint256 optionalBuyAmountWei,
        uint256 optionalSellAmountTwei
    )
        public
        view
        override
        returns (
            bytes32[] memory buyReserves,
            uint256[] memory buyRates,
            bytes32[] memory sellReserves,
            uint256[] memory sellRates
        )
    {
        (uint256 feeBps, ) = kyberDao.getLatestNetworkFeeData();
        return getRatesForTokenWithCustomFee(token, optionalBuyAmountWei, optionalSellAmountTwei, feeBps);
    }

    function getRatesForTokenWithCustomFee(
        IERC20 token,
        uint256 optionalBuyAmountWei,
        uint256 optionalSellAmountTwei,
        uint256 networkFeeBps
    )
        public
        view
        override
        returns (
            bytes32[] memory buyReserves,
            uint256[] memory buyRates,
            bytes32[] memory sellReserves,
            uint256[] memory sellRates
        )
    {
        uint256 buyAmountWei = optionalBuyAmountWei > 0 ? optionalBuyAmountWei : DEFAULT_RATE_QUERY_AMOUNT_WEI;
        (buyReserves, buyRates) = getBuyInfo(token, buyAmountWei, networkFeeBps);
        uint256 sellAmountTwei = optionalSellAmountTwei;
        if (sellAmountTwei == 0) {
            uint256 bestRate = 0;
            for (uint256 i = 0; i < buyRates.length; i++) {
                if (buyRates[i] > bestRate) {
                    bestRate = buyRates[i];
                }
            }
            if (bestRate != 0) {
                sellAmountTwei = calcDstQty(buyAmountWei, ETH_DECIMALS, getDecimals(token), bestRate);
            }
        }
        (sellReserves, sellRates) = getSellInfo(token, sellAmountTwei, networkFeeBps);
    }

    function getBuyInfo(
        IERC20 token,
        uint256 buyAmountWei,
        uint256 networkFeeBps
    ) internal view returns (bytes32[] memory buyReserves, uint256[] memory buyRates) {
        buyReserves = kyberStorage.getReserveIdsPerTokenDest(token);
        buyRates = getBuyRate(token, buyAmountWei, networkFeeBps, buyReserves);
    }

    function getBuyRate(
        IERC20 token,
        uint256 buyAmountWei,
        uint256 networkFeeBps,
        bytes32[] memory buyReserves
    ) internal view returns (uint256[] memory buyRates) {
        bool[] memory isFeeAccountedFlags = kyberStorage.getFeeAccountedData(buyReserves);
        address[] memory buyReserveAddresses = kyberStorage.getReserveAddressesFromIds(
            buyReserves
        );
        buyRates = new uint256[](buyReserves.length);
        uint256 buyAmountWithFee = buyAmountWei - ((buyAmountWei * networkFeeBps) / BPS);
        for (uint256 i = 0; i < buyReserves.length; i++) {
            if (networkFeeBps == 0 || !isFeeAccountedFlags[i]) {
                buyRates[i] = IKyberReserve(buyReserveAddresses[i]).getConversionRate(
                    ETH_TOKEN_ADDRESS,
                    token,
                    buyAmountWei,
                    block.number
                );
                continue;
            }
            buyRates[i] = IKyberReserve(buyReserveAddresses[i]).getConversionRate(
                ETH_TOKEN_ADDRESS,
                token,
                buyAmountWithFee,
                block.number
            );
            uint256 destAmount = calcDstQty(
                buyAmountWithFee,
                ETH_DECIMALS,
                getDecimals(token),
                buyRates[i]
            );
            //use amount instead of ethSrcAmount to account for network fee
            buyRates[i] = calcRateFromQty(buyAmountWei, destAmount, ETH_DECIMALS, getDecimals(token));
        }
    }

    function getSellInfo(
        IERC20 token,
        uint256 sellAmountTwei,
        uint256 networkFeeBps
    ) internal view returns (bytes32[] memory sellReserves, uint256[] memory sellRates) {
        sellReserves = kyberStorage.getReserveIdsPerTokenSrc(token);
        sellRates = getSellRate(token, sellAmountTwei, networkFeeBps, sellReserves);
    }

    function getSellRate(
        IERC20 token,
        uint256 sellAmountTwei,
        uint256 networkFeeBps,
        bytes32[] memory sellReserves
    ) internal view returns (uint256[] memory sellRates) {
        bool[] memory isFeeAccountedFlags = kyberStorage.getFeeAccountedData(sellReserves);
        address[] memory sellReserveAddresses = kyberStorage.getReserveAddressesFromIds(
            sellReserves
        );
        sellRates = new uint256[](sellReserves.length);
        for (uint256 i = 0; i < sellReserves.length; i++) {
            sellRates[i] = IKyberReserve(sellReserveAddresses[i]).getConversionRate(
                token,
                ETH_TOKEN_ADDRESS,
                sellAmountTwei,
                block.number
            );
            if (networkFeeBps == 0 || !isFeeAccountedFlags[i]) {
                continue;
            }
            uint256 destAmount = calcDstQty(
                sellAmountTwei,
                getDecimals(token),
                ETH_DECIMALS,
                sellRates[i]
            );
            destAmount -= (networkFeeBps * destAmount) / BPS;
            sellRates[i] = calcRateFromQty(
                sellAmountTwei,
                destAmount,
                getDecimals(token),
                ETH_DECIMALS
            );
        }
    }

    function getSpreadInfo(IERC20 token, uint256 optionalAmountWei)
        public
        view
        override
        returns (bytes32[] memory reserves, int256[] memory spreads)
    {
        uint256 amountWei = optionalAmountWei > 0 ? optionalAmountWei : DEFAULT_SPREAD_QUERY_AMOUNT_WEI;
        (
            bytes32[] memory buyReserves,
            uint256[] memory buyRates,
            bytes32[] memory sellReserves,
            uint256[] memory sellRates
        ) = getReservesRates(token, amountWei);
        // map pair of buyRate and sellRate from the same Reserve
        uint256[] memory validReserves = new uint256[](buyReserves.length);
        uint256[] memory revertReserveIndex = new uint256[](buyReserves.length);
        uint256 validReserveSize = 0;
        for (uint256 i = 0; i < buyRates.length; i++) {
            for (uint256 j = 0; j < sellRates.length; j++) {
                if (sellReserves[j] == buyReserves[i]) {
                    revertReserveIndex[i] = j;
                    validReserves[validReserveSize] = i;
                    validReserveSize++;
                    break;
                }
            }
        }
        reserves = new bytes32[](validReserveSize);
        spreads = new int256[](validReserveSize);
        for (uint256 i = 0; i < validReserveSize; i++) {
            uint256 reserveIndex = validReserves[i];
            reserves[i] = buyReserves[reserveIndex];
            spreads[i] = calcSpreadInBps(
                buyRates[reserveIndex],
                sellRates[revertReserveIndex[reserveIndex]]
            );
        }
    }

    function getSpreadInfoWithConfigReserves(IERC20 token, uint256 optionalAmountWei)
        public
        view
        returns (bytes32[] memory reserves, int256[] memory spreads)
    {
        uint256[] memory buyRates;
        uint256[] memory sellRates;
        uint256 amountWei = optionalAmountWei > 0 ? optionalAmountWei : DEFAULT_SPREAD_QUERY_AMOUNT_WEI;
        (reserves, buyRates, sellRates) = getReservesRatesWithConfigReserves(token, amountWei);

        spreads = new int256[](reserves.length);
        for (uint256 i = 0; i < buyRates.length; i++) {
            spreads[i] = calcSpreadInBps(buyRates[i], sellRates[i]);
        }
    }

    function getSlippageRateInfo(
        IERC20 token,
        uint256 optionalAmountWei,
        uint256 optionalSlippageAmount
    )
        public
        view
        override
        returns (
            bytes32[] memory buyReserves,
            int256[] memory buySlippageRateBps,
            bytes32[] memory sellReserves,
            int256[] memory sellSlippageRateBps
        )
    {
        uint256 baseAmount = optionalAmountWei > 0 ? optionalAmountWei : DEFAULT_SLIPPAGE_QUERY_BASE_AMOUNT_WEI;
        uint256[] memory baseBuyRates;
        uint256[] memory baseSellRates;
        (buyReserves, baseBuyRates, sellReserves, baseSellRates) = getReservesRates(
            token,
            baseAmount
        );
        uint256 slippageAmount = optionalSlippageAmount > 0
            ? optionalSlippageAmount
            : DEFAULT_SLIPPAGE_QUERY_AMOUNT_WEI;
        uint256[] memory slippageBuyRates;
        uint256[] memory slippageSellRates;
        (, slippageBuyRates, , slippageSellRates) = getReservesRates(token, slippageAmount);
        // no rate exists for slippageAmount but rate exists for baseAmount
        if (slippageSellRates.length == 0 && baseSellRates.length != 0) {
            slippageSellRates = new uint256[](baseSellRates.length);
        }

        assert(slippageSellRates.length == baseSellRates.length);
        assert(slippageBuyRates.length == baseBuyRates.length);

        buySlippageRateBps = new int256[](buyReserves.length);
        for (uint256 i = 0; i < buyReserves.length; i++) {
            buySlippageRateBps[i] = calcSlippageRateInBps(baseBuyRates[i], slippageBuyRates[i], true);
        }

        sellSlippageRateBps = new int256[](sellReserves.length);
        for (uint256 i = 0; i < sellReserves.length; i++) {
            sellSlippageRateBps[i] = calcSlippageRateInBps(baseSellRates[i], slippageSellRates[i], false);
        }
    }

    function getSlippageRateInfoWithConfigReserves(
        IERC20 token,
        uint256 optionalAmountWei,
        uint256 optionalSlippageAmount
    )
        public
        view
        returns (
            bytes32[] memory reserves,
            int256[] memory buySlippageRateBps,
            int256[] memory sellSlippageRateBps
        )
    {
        uint256 baseAmount = optionalAmountWei > 0 ? optionalAmountWei : DEFAULT_SLIPPAGE_QUERY_BASE_AMOUNT_WEI;
        uint256[] memory baseBuyRates;
        uint256[] memory baseSellRates;
        (reserves, baseBuyRates, baseSellRates) = getReservesRatesWithConfigReserves(
            token,
            baseAmount
        );
        uint256 slippageAmount = optionalSlippageAmount > 0
            ? optionalSlippageAmount
            : DEFAULT_SLIPPAGE_QUERY_AMOUNT_WEI;
        uint256[] memory slippageBuyRates;
        uint256[] memory slippageSellRates;
        (, slippageBuyRates, slippageSellRates) = getReservesRatesWithConfigReserves(
            token,
            slippageAmount
        );

        assert(slippageSellRates.length == baseSellRates.length);
        assert(slippageBuyRates.length == baseBuyRates.length);

        buySlippageRateBps = new int256[](baseBuyRates.length);
        for (uint256 i = 0; i < baseBuyRates.length; i++) {
            buySlippageRateBps[i] = calcSlippageRateInBps(baseBuyRates[i], slippageBuyRates[i], true);
        }

        sellSlippageRateBps = new int256[](baseSellRates.length);
        for (uint256 i = 0; i < baseSellRates.length; i++) {
            sellSlippageRateBps[i] = calcSlippageRateInBps(baseSellRates[i], slippageSellRates[i], false);
        }
    }

    /// @dev if sellRate == 0 return 2 * BPS (max value of spread)
    /// @dev if buyRate ** sellRate >= 10 ** 36 (negative spread) return 0
    /// @dev spread can be from -2 * BPS to 2 * BPS
    function calcSpreadInBps(uint256 buyRate, uint256 sellRate) internal pure returns (int256) {
        if (buyRate == 0) {
            return 2 * int256(BPS);
        }
        int256 reversedBuyRate = int256(PRECISION**2 / buyRate);
        int256 sellRateInt256 = int256(sellRate);
        return (2 * int256(BPS) * (reversedBuyRate - sellRateInt256)) / (reversedBuyRate + sellRateInt256);
    }

    /// @dev if baseRate == 0 return -1
    /// @dev if slippageRate == 0 return BPS
    /// @dev if baseRate < slippageRate return 0
    function calcSlippageRateInBps(
        uint256 baseRate,
        uint256 slippageRate,
        bool isBuy
    ) internal pure returns (int256) {
        if (baseRate == 0) {
            return -1;
        }
        if (slippageRate == 0) {
            return int256(BPS);
        }
        if (slippageRate > baseRate) {
            return 0;
        }
        if (isBuy) {
            uint256 reversedBaseRate = PRECISION**2 / baseRate;
            uint256 reversedSlippageRate = PRECISION**2 / slippageRate;
            return int256((BPS * (reversedSlippageRate - reversedBaseRate)) / reversedBaseRate);
        } else {
            return int256((BPS * (baseRate - slippageRate)) / baseRate);
        }
    }
}
