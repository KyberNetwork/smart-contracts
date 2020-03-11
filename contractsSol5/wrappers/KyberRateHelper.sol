pragma  solidity 0.5.11;

import "../IKyberMatchingEngine.sol";
import "../IKyberRateHelper.sol";
import "../IKyberDAO.sol";
import "../utils/Utils4.sol";
import "../utils/Withdrawable2.sol";


contract KyberRateHelper is IKyberRateHelper, Withdrawable2, Utils4 {

    IKyberMatchingEngine public matchingEngine;
    IKyberDAO public kyberDAO;

    constructor(address _admin) public
        Withdrawable2(_admin)
    { /* empty body */ }

    event MatchingEngineContractSet(IKyberMatchingEngine matchingEngine);
    event KyberDAOContractSet(IKyberDAO kyberDAO);

    function setContracts(IKyberMatchingEngine _matchingEngine, IKyberDAO _kyberDAO) public onlyAdmin {
        require(_matchingEngine != IKyberMatchingEngine(0), "missing addr");
        require(_kyberDAO != IKyberDAO(0), "missing addr");

        if (matchingEngine != _matchingEngine) {
            matchingEngine = _matchingEngine;
            emit MatchingEngineContractSet(_matchingEngine);
        }

        if (kyberDAO != _kyberDAO) {
            kyberDAO = _kyberDAO;
            emit KyberDAOContractSet(_kyberDAO);
        }
    }

    struct Amounts {
        uint srcAmount;
        uint ethSrcAmount;
        uint destAmount;
    }

    function getRatesForToken(IERC20 token, uint optionalBuyAmount, uint optionalSellAmount) public view
        returns(IKyberReserve[] memory buyReserves, uint[] memory buyRates,
            IKyberReserve[] memory sellReserves, uint[] memory sellRates)
    {
        (uint feeBps, ) = kyberDAO.getLatestNetworkFeeData();
        return getRatesForTokenWithCustomFee(token, optionalBuyAmount, optionalSellAmount, feeBps);
    }

    function getPricesForToken(IERC20 token, uint optionalBuyAmount, uint optionalSellAmount) public view
        returns(IKyberReserve[] memory buyReserves, uint[] memory buyRates, IKyberReserve[] memory sellReserves, 
            uint[] memory sellRates)
    {
        return getRatesForTokenWithCustomFee(token, optionalBuyAmount, optionalSellAmount, 0);
    }

    function getRatesForTokenWithCustomFee(IERC20 token, uint optionalBuyAmount, uint optionalSellAmount, uint networkFeeBps)
        public view
        returns(IKyberReserve[] memory buyReserves, uint[] memory buyRates,
            IKyberReserve[] memory sellReserves, uint[] memory sellRates)
    {
        Amounts memory A;

        A.srcAmount = optionalBuyAmount > 0 ? optionalBuyAmount : 1000;
        buyReserves = matchingEngine.getReservesPerTokenDest(token);
        buyRates = new uint[](buyReserves.length);
        bool[] memory isFeePaying = getIsFeePayingReserves(buyReserves);

        uint i;
        for (i = 0; i < buyReserves.length; i++) {
            if (networkFeeBps == 0 || !isFeePaying[i]) {
                buyRates[i] = buyReserves[i].getConversionRate(ETH_TOKEN_ADDRESS, token, A.srcAmount, block.number);
                continue;
            }

            A.ethSrcAmount = A.srcAmount - (A.srcAmount * networkFeeBps / BPS);
            buyRates[i] = buyReserves[i].getConversionRate(ETH_TOKEN_ADDRESS, token, A.ethSrcAmount, block.number);
            A.destAmount = calcDstQty(A.ethSrcAmount, ETH_DECIMALS, getDecimals(token), buyRates[i]);
            //use amount instead of ethSrcAmount to account for network fee
            buyRates[i] = calcRateFromQty(A.srcAmount, A.destAmount, ETH_DECIMALS, getDecimals(token));
        }

        A.srcAmount = optionalSellAmount > 0 ? optionalSellAmount : 1000;
        sellReserves = matchingEngine.getReservesPerTokenSrc(token);
        sellRates = new uint[](sellReserves.length);
        isFeePaying = getIsFeePayingReserves(sellReserves);

        for (i = 0; i < sellReserves.length; i++) {
            sellRates[i] = sellReserves[i].getConversionRate(token, ETH_TOKEN_ADDRESS, A.srcAmount, block.number);
            if (networkFeeBps == 0 || !isFeePaying[i]) {
                continue;
            }
            A.destAmount = calcDstQty(A.srcAmount, getDecimals(token), ETH_DECIMALS, sellRates[i]);
            A.destAmount -= networkFeeBps * A.destAmount / BPS;
            sellRates[i] = calcRateFromQty(A.srcAmount, A.destAmount, getDecimals(token), ETH_DECIMALS);
        }
    }

    function getIsFeePayingReserves(IKyberReserve[] memory reserves) internal view
        returns(bool[] memory feePayingArr)
    {
        feePayingArr = new bool[](reserves.length);

        for (uint i = 0; i < reserves.length; i++) {
            (, , feePayingArr[i]) = matchingEngine.getReserveDetails(address(reserves[i]));
        }
    }
}
