pragma solidity 0.5.11;

import "../IKyberMatchingEngine.sol";
import "../IKyberRateHelper.sol";
import "../IKyberDAO.sol";
import "../IKyberStorage.sol";
import "../utils/Utils4.sol";
import "../utils/WithdrawableNoModifiers.sol";


contract KyberRateHelper is IKyberRateHelper, WithdrawableNoModifiers, Utils4 {
    struct Amounts {
        uint256 srcAmount;
        uint256 ethSrcAmount;
        uint256 destAmount;
    }

    IKyberMatchingEngine public matchingEngine;
    IKyberDAO public kyberDAO;
    IKyberStorage public kyberStorage;

    constructor(address _admin) public WithdrawableNoModifiers(_admin) {
        /* empty body */
    }

    event KyberDAOContractSet(IKyberDAO kyberDAO);
    event KyberStorageSet(IKyberStorage kyberStorage);
    event MatchingEngineContractSet(IKyberMatchingEngine matchingEngine);

    function setContracts(
        IKyberMatchingEngine _matchingEngine,
        IKyberDAO _kyberDAO,
        IKyberStorage _kyberStorage
    ) public {
        onlyAdmin();
        require(_matchingEngine != IKyberMatchingEngine(0), "matching engine 0");
        require(_kyberDAO != IKyberDAO(0), "kyberDAO 0");
        require(_kyberStorage != IKyberStorage(0), "kyberStorage 0");

        if (matchingEngine != _matchingEngine) {
            matchingEngine = _matchingEngine;
            emit MatchingEngineContractSet(_matchingEngine);
        }

        if (kyberDAO != _kyberDAO) {
            kyberDAO = _kyberDAO;
            emit KyberDAOContractSet(_kyberDAO);
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
        returns (
            bytes32[] memory buyReserves,
            uint256[] memory buyRates,
            bytes32[] memory sellReserves,
            uint256[] memory sellRates
        )
    {
        return getRatesForTokenWithCustomFee(token, optionalBuyAmount, optionalSellAmount, 0);
    }

    function getRatesForToken(
        IERC20 token,
        uint256 optionalBuyAmount,
        uint256 optionalSellAmount
    )
        public
        view
        returns (
            bytes32[] memory buyReserves,
            uint256[] memory buyRates,
            bytes32[] memory sellReserves,
            uint256[] memory sellRates
        )
    {
        (uint256 feeBps, ) = kyberDAO.getLatestNetworkFeeData();
        return getRatesForTokenWithCustomFee(token, optionalBuyAmount, optionalSellAmount, feeBps);
    }

    // prettier-ignore
    function getRatesForTokenWithCustomFee(
        IERC20 token,
        uint256 optionalBuyAmount,
        uint256 optionalSellAmount,
        uint256 networkFeeBps
    )
        public
        view
        returns (
            bytes32[] memory buyReserves,
            uint256[] memory buyRates,
            bytes32[] memory sellReserves,
            uint256[] memory sellRates
        )
    {
        (buyReserves, buyRates) = getBuyInfo(
            token,
            optionalBuyAmount,
            networkFeeBps
        );
        (sellReserves, sellRates) = getSellInfo(
            token,
            optionalSellAmount,
            networkFeeBps
        );
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
            (reserve, , ) = kyberStorage.getReserveDetailsById(buyReserves[i]);
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
            (reserve, , ) = kyberStorage.getReserveDetailsById(sellReserves[i]);
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
}
