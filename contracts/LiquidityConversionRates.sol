pragma solidity 0.4.18;

import "./ConversionRatesInterface.sol";
import "./LiquidityFormula.sol";
import "./Withdrawable.sol";
import "./Utils.sol";


contract LiquidityConversionRates is ConversionRatesInterface, LiquidityFormula, Withdrawable, Utils {
    ERC20 public token;
    uint public rInFp;
    uint public pMinInFp;
    uint public formulaPrecision;
    uint public numFpBits;
    uint public maxCapBuyInFp;
    uint public maxCapSellInFp;
    uint public collectedFeesInTwei;
    uint public feeInBps;
    uint public maxBuyRateInPRECISION;
    uint public minBuyRateInPRECISION;
    uint public maxSellRateInPRECISION;
    uint public minSellRateInPRECISION;
    address public reserveContract;

    function LiquidityConversionRates(address _admin, ERC20 _token, address _reserveContract) public {
        transferAdminQuickly(_admin);
        token = _token;
        reserveContract = _reserveContract;
        setDecimals(token);
        // TODO: require that token decimals is smaller than max decimals (also from utils).
    }

    event LiquidityParamsSet(
        uint rInFp,
        uint pMinInFp,
        uint numFpBits,
        uint maxCapBuyInFp,
        uint maxCapSellInFp,
        uint feeInBps,
        uint formulaPrecision,
        uint maxBuyRateInPRECISION,
        uint minBuyRateInPRECISION,
        uint maxSellRateInPRECISION,
        uint minSellRateInPRECISION
    );

    function setLiquidityParams(
        uint _rInFp,
        uint _pMinInFp,
        uint _numFpBits,
        uint _maxCapBuyInWei,
        uint _maxCapSellInWei,
        uint _feeInBps,
        uint _maxBuyRateInPRECISION,
        uint _minBuyRateInPRECISION,
        uint _maxSellRateInPRECISION,
        uint _minSellRateInPRECISION
    ) public onlyAdmin {

        rInFp = _rInFp;
        pMinInFp = _pMinInFp;
        formulaPrecision = uint(1)<<_numFpBits; // TODO: require _numFpBits smaller than 256.
        numFpBits = _numFpBits;
        maxCapBuyInFp = fromWeiToFp(_maxCapBuyInWei, formulaPrecision);
        maxCapSellInFp = fromWeiToFp(_maxCapSellInWei, formulaPrecision);
        collectedFeesInTwei = 0;
        require(_feeInBps < 10000);
        feeInBps = _feeInBps;
        maxBuyRateInPRECISION = _maxBuyRateInPRECISION;
        minBuyRateInPRECISION = _minBuyRateInPRECISION;
        maxSellRateInPRECISION = _maxSellRateInPRECISION;
        minSellRateInPRECISION = _minSellRateInPRECISION;

        LiquidityParamsSet(
            rInFp,
            pMinInFp,
            numFpBits,
            maxCapBuyInFp,
            maxCapSellInFp,
            feeInBps,
            formulaPrecision,
            maxBuyRateInPRECISION,
            minBuyRateInPRECISION,
            maxSellRateInPRECISION,
            minSellRateInPRECISION
        );
    }

    function getRate(
            ERC20 conversionToken,
            uint currentBlockNumber,
            bool buy,
            uint qtyInSrcWei
    ) public view returns(uint) {

    // TODO: require qtyInSrcWei < maxQty.
    // TODO: deltaT, deltaE < 10^30. ??? everywhere we calculate them?

        currentBlockNumber;

        uint eInFp = fromWeiToFp(reserveContract.balance, formulaPrecision);
        return getRateWithE(conversionToken, buy, qtyInSrcWei, eInFp);
    }

    function recordImbalance(
        ERC20 conversionToken,
        int buyAmountInTwei,
        uint rateUpdateBlock,
        uint currentBlock
    )
        public
    {
        conversionToken;
        rateUpdateBlock;
        currentBlock;

        require(msg.sender == reserveContract);
        collectedFeesInTwei += calcCollectedFee(abs(buyAmountInTwei), feeInBps);
    }

    event CollectedFeesReset(uint resetFeesInTwei);

    function resetCollectedFees() public onlyAdmin {
        uint resetFeesInTwei = collectedFeesInTwei;
        collectedFeesInTwei = 0;

        CollectedFeesReset(resetFeesInTwei);
    }

    function getRateWithE(ERC20 conversionToken, bool buy, uint qtyInSrcWei, uint eInFp) public view returns(uint) {
        uint deltaEInFp;
        uint deltaTInFp;
        uint rateInPRECISION;
        //TODO: also here - require qtyInSrcWei < maxQty (since it's public.)

        if (conversionToken != token) return 0;

        if (buy) {
            // ETH goes in, token goes out
            deltaEInFp = fromWeiToFp(qtyInSrcWei, formulaPrecision);
            if (deltaEInFp > maxCapBuyInFp) return 0;

            if (deltaEInFp == 0) {
                rateInPRECISION = buyRateZeroQuantity(eInFp);
            } else {
                rateInPRECISION = buyRate(eInFp, deltaEInFp);
            }
        } else {
            deltaTInFp = fromTweiToFp(token, qtyInSrcWei, formulaPrecision);
            deltaTInFp = reduceFee(deltaTInFp, feeInBps);
            if (deltaTInFp == 0) {
                rateInPRECISION = sellRateZeroQuantity(eInFp);
                deltaEInFp = 0;
            } else {
                deltaEInFp = deltaEFunc(rInFp, pMinInFp, eInFp, deltaTInFp, formulaPrecision, numFpBits);
                // TODO: after the call deltaEFunc - check if smaller than maxqty in precision
                // (save in constructor maxqty in
                // precision or divide each time, take it as constant from utils)
                rateInPRECISION = deltaEInFp * PRECISION / deltaTInFp;
            }

            if (deltaEInFp > maxCapSellInFp) return 0;
        }

        rateInPRECISION = validateRate(rateInPRECISION, buy);
        return rateInPRECISION;
    }

    function validateRate(uint rateInPRECISION, bool buy) public view returns(uint) {
        uint minAllowRateInPRECISION;
        uint maxAllowedRateInPRECISION;

        if (buy) {
            minAllowRateInPRECISION = minBuyRateInPRECISION;
            maxAllowedRateInPRECISION = maxBuyRateInPRECISION;
        } else {
            minAllowRateInPRECISION = minSellRateInPRECISION;
            maxAllowedRateInPRECISION = maxSellRateInPRECISION;
        }

        if ((rateInPRECISION > maxAllowedRateInPRECISION) || (rateInPRECISION < minAllowRateInPRECISION)) {
            return 0;
        } else {
            return rateInPRECISION;
        }

        // TODO: require smaller than MAX_RATE
    }

    function buyRate(uint _eInFp, uint _deltaEInFp) public view returns(uint) {
        // TODO: after the call deltaTFunc - check if smaller than maxqty in precision (save in constructor maxqty in
        // precision or divide each time, take it as constant from utils)
        uint deltaTInFp = deltaTFunc(rInFp, pMinInFp, _eInFp, _deltaEInFp, formulaPrecision); 
        deltaTInFp = reduceFee(deltaTInFp, feeInBps);
        return deltaTInFp * PRECISION / _deltaEInFp;
    }

    function buyRateZeroQuantity(uint _eInFp) public view returns(uint) {
        return formulaPrecision * PRECISION / PE(rInFp, pMinInFp, _eInFp, formulaPrecision);
    }

    function sellRateZeroQuantity(uint _eInFp) public view returns(uint) {
        return PE(rInFp, pMinInFp, _eInFp, formulaPrecision) * PRECISION / formulaPrecision;
    }

    function fromTweiToFp(ERC20 _token, uint qtyInTwei, uint _formulaPrecision) public view returns(uint) {
        return qtyInTwei * _formulaPrecision / (10 ** getDecimals(_token));
    }

    function fromWeiToFp(uint qtyInwei, uint _formulaPrecision) public pure returns(uint) {
        // TODO: require that amount (input) is smaller than maxquantity 
        return qtyInwei * _formulaPrecision / (10**ETH_DECIMALS);
    }

    function reduceFee(uint val, uint _feeInBps) public pure returns(uint) {
        // TODO: require that val is smaller than maxquantity, also feeinbps if it stays public.
        return ((10000 - _feeInBps) * val) / 10000;
    }

    function calcCollectedFee(uint val, uint _feeInBps) public pure returns(uint) {
        return val * _feeInBps / (10000 - _feeInBps);
    }
 
    function abs(int val) public pure returns(uint) {
        if (val < 0) {
            return uint(val * (-1));
        } else { 
            return uint(val);
        }
    }

}