pragma solidity 0.6.6;

import "../IKyberMatchingEngine.sol";
import "./IKyberRateHelper.sol";
import "../IKyberDao.sol";
import "../IKyberStorage.sol";
import "../utils/Utils5.sol";
import "../utils/WithdrawableNoModifiers.sol";

contract KyberRateHelper is IKyberRateHelper, WithdrawableNoModifiers, Utils5 {
    uint256 internal constant DEFAULT_SPREAD_VALUE = 10 ether;
    uint256 internal constant DEFAULT_SLIPPAGE_BASE_VALUE = 0.01 ether;
    uint256 internal constant DEFAULT_SLIPPAGE_VALUE = 10 ether;

    struct Amounts {
        uint256 srcAmount;
        uint256 ethSrcAmount;
        uint256 destAmount;
    }

    IKyberMatchingEngine public matchingEngine;
    IKyberDao public kyberDao;
    IKyberStorage public kyberStorage;

    constructor(address _admin) public WithdrawableNoModifiers(_admin) {
        /* empty body */
    }

    event KyberDaoContractSet(IKyberDao kyberDao);
    event KyberStorageSet(IKyberStorage kyberStorage);
    event MatchingEngineContractSet(IKyberMatchingEngine matchingEngine);

    function setContracts(
        IKyberMatchingEngine _matchingEngine,
        IKyberDao _kyberDao,
        IKyberStorage _kyberStorage
    ) public {
        onlyAdmin();
        require(_matchingEngine != IKyberMatchingEngine(0), "matching engine 0");
        require(_kyberDao != IKyberDao(0), "kyberDao 0");
        require(_kyberStorage != IKyberStorage(0), "kyberStorage 0");

        if (matchingEngine != _matchingEngine) {
            matchingEngine = _matchingEngine;
            emit MatchingEngineContractSet(_matchingEngine);
        }

        if (kyberDao != _kyberDao) {
            kyberDao = _kyberDao;
            emit KyberDaoContractSet(_kyberDao);
        }

        if (kyberStorage != _kyberStorage) {
            kyberStorage = _kyberStorage;
            emit KyberStorageSet(_kyberStorage);
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
        Amounts memory A;
        bool[] memory isFeeAccountedFlags;
        address reserve;

        A.srcAmount = optionalBuyAmount > 0 ? optionalBuyAmount : 1000;
        (buyReserves, , ) = matchingEngine.getTradingReserves(ETH_TOKEN_ADDRESS, token, false, "");
        isFeeAccountedFlags = kyberStorage.getFeeAccountedData(buyReserves);
        buyRates = new uint256[](buyReserves.length);

        for (uint256 i = 0; i < buyReserves.length; i++) {
            (reserve, , , ,) = kyberStorage.getReserveDetailsById(buyReserves[i]);
            if (networkFeeBps == 0 || !isFeeAccountedFlags[i]) {
                buyRates[i] = IKyberReserve(reserve).getConversionRate(
                    ETH_TOKEN_ADDRESS,
                    token,
                    A.srcAmount,
                    block.number
                );
                continue;
            }

            A.ethSrcAmount = A.srcAmount - ((A.srcAmount * networkFeeBps) / BPS);
            buyRates[i] = IKyberReserve(reserve).getConversionRate(
                ETH_TOKEN_ADDRESS,
                token,
                A.ethSrcAmount,
                block.number
            );
            A.destAmount = calcDstQty(
                A.ethSrcAmount,
                ETH_DECIMALS,
                getDecimals(token),
                buyRates[i]
            );
            //use amount instead of ethSrcAmount to account for network fee
            buyRates[i] = calcRateFromQty(
                A.srcAmount,
                A.destAmount,
                ETH_DECIMALS,
                getDecimals(token)
            );
        }
    }

    function getSellInfo(
        IERC20 token,
        uint256 optionalSellAmount,
        uint256 networkFeeBps
    ) internal view returns (bytes32[] memory sellReserves, uint256[] memory sellRates) {
        Amounts memory A;
        bool[] memory isFeeAccountedFlags;
        address reserve;

        A.srcAmount = optionalSellAmount > 0 ? optionalSellAmount : 1000;
        (sellReserves, , ) = matchingEngine.getTradingReserves(
            token,
            ETH_TOKEN_ADDRESS,
            false,
            ""
        );
        isFeeAccountedFlags = kyberStorage.getFeeAccountedData(sellReserves);
        sellRates = new uint256[](sellReserves.length);

        for (uint256 i = 0; i < sellReserves.length; i++) {
            (reserve, , , , ) = kyberStorage.getReserveDetailsById(sellReserves[i]);
            sellRates[i] = IKyberReserve(reserve).getConversionRate(
                token,
                ETH_TOKEN_ADDRESS,
                A.srcAmount,
                block.number
            );
            if (networkFeeBps == 0 || !isFeeAccountedFlags[i]) {
                continue;
            }
            A.destAmount = calcDstQty(A.srcAmount, getDecimals(token), ETH_DECIMALS, sellRates[i]);
            A.destAmount -= (networkFeeBps * A.destAmount) / BPS;
            sellRates[i] = calcRateFromQty(
                A.srcAmount,
                A.destAmount,
                getDecimals(token),
                ETH_DECIMALS
            );
        }
    }

    function getSpreadInfo(IERC20 token, uint256 optionalEthAmount)
        public
        view
        override
        returns (bytes32[] memory reserves, uint256[] memory spreads)
    {
        uint256 ethAmount = optionalEthAmount > 0 ? optionalEthAmount : DEFAULT_SPREAD_VALUE;
        (
            bytes32[] memory buyReserves,
            uint256[] memory buyRates,
            bytes32[] memory sellReserves,
            uint256[] memory sellRates
        ) = getReservesRates(token, ethAmount);

        uint256[] memory revertReserveIndex = new uint256[](buyReserves.length);
        uint256 validReserve = 0;
        for (uint256 i = 0; i < buyRates.length; i++) {
            if (buyRates[i] == 0) {
                continue;
            }

            for (uint256 j = 0; j < sellRates.length; j++) {
                if (sellReserves[j] == buyReserves[i]) {
                    if (sellRates[j] == 0) break;
                    revertReserveIndex[i] = j;
                    validReserve++;
                    break;
                }
            }
        }
        reserves = new bytes32[](validReserve);
        spreads = new uint256[](validReserve);
        uint256 reserveIndex;
        for (uint256 i = 0; i < buyRates.length; i++) {
            if (buyRates[i] == 0) {
                continue;
            }
            reserves[reserveIndex] = buyReserves[i];
            spreads[reserveIndex] = calcSpreadInBps(buyRates[i], sellRates[revertReserveIndex[i]]);
            reserveIndex++;
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
        uint256 slippageAmount = optinalSlippageAmount > 0 ? optinalSlippageAmount : DEFAULT_SLIPPAGE_VALUE;
        uint256[] memory slippageBuyRates;
        uint256[] memory slippageSellRates;
        (, slippageBuyRates, , slippageSellRates) = getReservesRates(token, slippageAmount);

        assert(slippageSellRates.length == baseSellRates.length);
        assert(slippageSellRates.length == baseSellRates.length);

        buySlippageRateBps = new int256[](buyReserves.length);
        for (uint256 i = 0; i < buyReserves.length; i++) {
            buySlippageRateBps[i] = calcSlippageRateInBps(baseBuyRates[i], slippageBuyRates[i]);
        }

        sellSlippageRateBps = new int256[](sellReserves.length);
        for (uint256 i = 0; i < sellReserves.length; i++) {
            sellSlippageRateBps[i] = calcSlippageRateInBps(baseSellRates[i], slippageSellRates[i]);
        }
    }

    function calcSpreadInBps(uint256 buyRate, uint256 sellRate) internal pure returns (uint256) {
        assert(buyRate != 0);
        assert(sellRate != 0);
        return
            (2 * BPS * (PRECISION**2 / sellRate - buyRate)) / (PRECISION**2 / sellRate + buyRate);
    }

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
