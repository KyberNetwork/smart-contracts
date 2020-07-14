pragma solidity 0.6.6;

import "../IKyberMatchingEngine.sol";
import "./IKyberRateHelper.sol";
import "../IKyberDao.sol";
import "../IKyberStorage.sol";
import "../IKyberReserve.sol";
import "../utils/Utils5.sol";
import "../utils/WithdrawableNoModifiers.sol";


contract KyberRateHelper is IKyberRateHelper, WithdrawableNoModifiers, Utils5 {
    uint256 internal constant DEFAULT_SPREAD_VALUE = 10 ether;
    uint256 internal constant DEFAULT_SLIPPAGE_BASE_VALUE = 0.01 ether;
    uint256 internal constant DEFAULT_SLIPPAGE_VALUE = 10 ether;

    struct Amounts {
        uint256 sellAmount;
        uint256 ethSrcAmount;
        uint256 destAmount;
    }

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
        uint256 optionalBuyAmount,
        uint256 optionalSellAmount
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
        return getRatesForTokenWithCustomFee(token, optionalBuyAmount, optionalSellAmount, 0);
    }

    /// @dev function to cover backward compatible with old network interface
    /// @dev get rate from token to eth, use the best eth amount to get rate from eth to token
    /// @param token Token to get rate
    /// @param optionalEthAmount Amount to get rate (default: 0)
    function getReservesRates(IERC20 token, uint256 optionalEthAmount)
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
        uint256 buyAmount = optionalEthAmount > 0 ? optionalEthAmount : 1 ether;

        (buyReserves, buyRates) = getBuyInfo(token, buyAmount, networkFeeBps);

        uint256 bestRate = 0;
        for (uint256 i = 0; i < buyRates.length; i++) {
            if (buyRates[i] > bestRate) {
                bestRate = buyRates[i];
            }
        }

        if (bestRate == 0) {
            return (buyReserves, buyRates, sellReserves, sellRates);
        }
        uint256 sellAmount = calcDstQty(buyAmount, ETH_DECIMALS, getDecimals(token), bestRate);
        (sellReserves, sellRates) = getSellInfo(token, sellAmount, networkFeeBps);
    }

    function getReservesRatesWithConfigReserves(IERC20 token, uint256 optionalEthAmount)
        public
        view
        returns (
            bytes32[] memory reserves,
            uint256[] memory buyRates,
            uint256[] memory sellRates
        )
    {
        (uint256 networkFeeBps, ) = kyberDao.getLatestNetworkFeeData();
        uint256 buyAmount = optionalEthAmount > 0 ? optionalEthAmount : 1 ether;
        reserves = reserveIds;
        buyRates = getBuyRate(token, buyAmount, networkFeeBps, reserves);

        uint256 bestRate = 0;
        for (uint256 i = 0; i < buyRates.length; i++) {
            if (buyRates[i] > bestRate) {
                bestRate = buyRates[i];
            }
        }

        if (bestRate == 0) {
            return (reserves, buyRates, sellRates);
        }
        uint256 sellAmount = calcDstQty(buyAmount, ETH_DECIMALS, getDecimals(token), bestRate);
        sellRates = getSellRate(token, sellAmount, networkFeeBps, reserves);
    }

    function getRatesForToken(
        IERC20 token,
        uint256 optionalBuyAmount,
        uint256 optionalSellAmount
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
        return getRatesForTokenWithCustomFee(token, optionalBuyAmount, optionalSellAmount, feeBps);
    }

    function getRatesForTokenWithCustomFee(
        IERC20 token,
        uint256 optionalBuyAmount,
        uint256 optionalSellAmount,
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
        (buyReserves, buyRates) = getBuyInfo(token, optionalBuyAmount, networkFeeBps);
        (sellReserves, sellRates) = getSellInfo(token, optionalSellAmount, networkFeeBps);
    }

    function getBuyInfo(
        IERC20 token,
        uint256 optionalBuyAmount,
        uint256 networkFeeBps
    ) internal view returns (bytes32[] memory buyReserves, uint256[] memory buyRates) {
        uint256 buyAmount = optionalBuyAmount > 0 ? optionalBuyAmount : 1000;
        buyReserves = kyberStorage.getReserveIdsPerTokenDest(token);
        buyRates = getBuyRate(token, buyAmount, networkFeeBps, buyReserves);
    }

    function getBuyRate(
        IERC20 token,
        uint256 buyAmount,
        uint256 networkFeeBps,
        bytes32[] memory buyReserves
    ) internal view returns (uint256[] memory buyRates) {
        bool[] memory isFeeAccountedFlags = kyberStorage.getFeeAccountedData(buyReserves);
        address[] memory buyReserveAddresses = kyberStorage.getReserveAddressesFromIds(
            buyReserves
        );
        buyRates = new uint256[](buyReserves.length);
        uint256 buyAmountWithFee = buyAmount - ((buyAmount * networkFeeBps) / BPS);
        for (uint256 i = 0; i < buyReserves.length; i++) {
            if (networkFeeBps == 0 || !isFeeAccountedFlags[i]) {
                buyRates[i] = IKyberReserve(buyReserveAddresses[i]).getConversionRate(
                    ETH_TOKEN_ADDRESS,
                    token,
                    buyAmount,
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
            buyRates[i] = calcRateFromQty(buyAmount, destAmount, ETH_DECIMALS, getDecimals(token));
        }
    }

    function getSellInfo(
        IERC20 token,
        uint256 optionalSellAmount,
        uint256 networkFeeBps
    ) internal view returns (bytes32[] memory sellReserves, uint256[] memory sellRates) {
        uint256 sellAmount = optionalSellAmount > 0 ? optionalSellAmount : 1000;
        sellReserves = kyberStorage.getReserveIdsPerTokenSrc(token);
        sellRates = getSellRate(token, sellAmount, networkFeeBps, sellReserves);
    }

    function getSellRate(
        IERC20 token,
        uint256 sellAmount,
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
                sellAmount,
                block.number
            );
            if (networkFeeBps == 0 || !isFeeAccountedFlags[i]) {
                continue;
            }
            uint256 destAmount = calcDstQty(
                sellAmount,
                getDecimals(token),
                ETH_DECIMALS,
                sellRates[i]
            );
            destAmount -= (networkFeeBps * destAmount) / BPS;
            sellRates[i] = calcRateFromQty(
                sellAmount,
                destAmount,
                getDecimals(token),
                ETH_DECIMALS
            );
        }
    }

    function getSpreadInfo(IERC20 token, uint256 optionalEthAmount)
        public
        view
        override
        returns (bytes32[] memory reserves, int256[] memory spreads)
    {
        uint256 ethAmount = optionalEthAmount > 0 ? optionalEthAmount : DEFAULT_SPREAD_VALUE;
        (
            bytes32[] memory buyReserves,
            uint256[] memory buyRates,
            bytes32[] memory sellReserves,
            uint256[] memory sellRates
        ) = getReservesRates(token, ethAmount);
        // map pair of buyRate and sell Rate from the same Reserve
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

    function getSpreadInfoWithConfigReserves(IERC20 token, uint256 optionalEthAmount)
        public
        view
        returns (bytes32[] memory reserves, int256[] memory spreads)
    {
        uint256[] memory buyRates;
        uint256[] memory sellRates;
        uint256 ethAmount = optionalEthAmount > 0 ? optionalEthAmount : DEFAULT_SPREAD_VALUE;
        (reserves, buyRates, sellRates) = getReservesRatesWithConfigReserves(token, ethAmount);

        spreads = new int256[](reserves.length);
        for (uint256 i = 0; i < buyRates.length; i++) {
            spreads[i] = calcSpreadInBps(buyRates[i], sellRates[i]);
        }
    }

    function getSlippageRateInfo(
        IERC20 token,
        uint256 optinalEthAmount,
        uint256 optinalSlippageAmount
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
        uint256 baseAmount = optinalEthAmount > 0 ? optinalEthAmount : DEFAULT_SLIPPAGE_BASE_VALUE;
        uint256[] memory baseBuyRates;
        uint256[] memory baseSellRates;
        (buyReserves, baseBuyRates, sellReserves, baseSellRates) = getReservesRates(
            token,
            baseAmount
        );
        uint256 slippageAmount = optinalSlippageAmount > 0
            ? optinalSlippageAmount
            : DEFAULT_SLIPPAGE_VALUE;
        uint256[] memory slippageBuyRates;
        uint256[] memory slippageSellRates;
        (, slippageBuyRates, , slippageSellRates) = getReservesRates(token, slippageAmount);

        assert(slippageSellRates.length == baseSellRates.length);
        assert(slippageBuyRates.length == baseBuyRates.length);

        buySlippageRateBps = new int256[](buyReserves.length);
        for (uint256 i = 0; i < buyReserves.length; i++) {
            buySlippageRateBps[i] = calcSlippageRateInBps(baseBuyRates[i], slippageBuyRates[i]);
        }

        sellSlippageRateBps = new int256[](sellReserves.length);
        for (uint256 i = 0; i < sellReserves.length; i++) {
            sellSlippageRateBps[i] = calcSlippageRateInBps(baseSellRates[i], slippageSellRates[i]);
        }
    }

    function getSlippageRateInfoWithConfigReserves(
        IERC20 token,
        uint256 optinalEthAmount,
        uint256 optinalSlippageAmount
    )
        public
        view
        returns (
            bytes32[] memory reserves,
            int256[] memory buySlippageRateBps,
            int256[] memory sellSlippageRateBps
        )
    {
        uint256 baseAmount = optinalEthAmount > 0 ? optinalEthAmount : DEFAULT_SLIPPAGE_BASE_VALUE;
        uint256[] memory baseBuyRates;
        uint256[] memory baseSellRates;
        (reserves, baseBuyRates, baseSellRates) = getReservesRatesWithConfigReserves(
            token,
            baseAmount
        );
        uint256 slippageAmount = optinalSlippageAmount > 0
            ? optinalSlippageAmount
            : DEFAULT_SLIPPAGE_VALUE;
        uint256[] memory slippageBuyRates;
        uint256[] memory slippageSellRates;
        (, slippageBuyRates, slippageSellRates) = getReservesRatesWithConfigReserves(
            token,
            slippageAmount
        );

        assert(slippageSellRates.length == baseSellRates.length);
        assert(slippageBuyRates.length == baseBuyRates.length);

        buySlippageRateBps = new int256[](reserves.length);
        for (uint256 i = 0; i < reserves.length; i++) {
            buySlippageRateBps[i] = calcSlippageRateInBps(baseBuyRates[i], slippageBuyRates[i]);
        }

        sellSlippageRateBps = new int256[](reserves.length);
        for (uint256 i = 0; i < reserves.length; i++) {
            sellSlippageRateBps[i] = calcSlippageRateInBps(baseSellRates[i], slippageSellRates[i]);
        }
    }

    /// @dev if buyRate or sellRate == 0 return -1
    /// @dev if buyRate ** sellRate >= 10 ** 36 (negative spread) return 0
    /// @dev can return negative spread
    function calcSpreadInBps(uint256 buyRate, uint256 sellRate) internal pure returns (int256) {
        if (buyRate == 0 || sellRate == 0) {
            return -1;
        }
        uint256 reversedSellRate = PRECISION**2 / sellRate;
        if(reversedSellRate < buyRate) {
            return 0;
        }
        return int256((2 * BPS * (reversedSellRate - buyRate)) / (reversedSellRate + buyRate));
    }

    /// @dev if baseRate == 0 return -1
    /// @dev if baseRate < slippageRate return 0
    function calcSlippageRateInBps(uint256 baseRate, uint256 slippageRate)
        internal
        pure
        returns (int256)
    {
        if (baseRate == 0) {
            return -1;
        }
        if (slippageRate > baseRate) {
            return 0;
        }
        return int256((BPS * (baseRate - slippageRate)) / baseRate);
    }
}
