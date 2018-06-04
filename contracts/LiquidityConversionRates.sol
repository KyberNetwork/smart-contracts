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
    uint public maxQtyInFp;
    address public reserveContract;

    function LiquidityConversionRates(address _admin, ERC20 _token, address _reserveContract) public {
        transferAdminQuickly(_admin);
        reserveContract = _reserveContract;
        token = _token;
        setDecimals(token);
        require(getDecimals(token) <= MAX_DECIMALS);
    }

    event LiquidityParamsSet(
        uint rInFp,
        uint pMinInFp,
        uint numFpBits,
        uint maxCapBuyInFp,
        uint maxCapSellInFp,
        uint feeInBps,
        uint formulaPrecision,
        uint maxQtyInFp,
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
        require(_numFpBits < 256);
        formulaPrecision = uint(1)<<_numFpBits;
        require(formulaPrecision < MAX_QTY);
        maxQtyInFp = MAX_QTY / formulaPrecision;
        numFpBits = _numFpBits;
        maxCapBuyInFp = fromWeiToFp(_maxCapBuyInWei);
        maxCapSellInFp = fromWeiToFp(_maxCapSellInWei);
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
            maxQtyInFp,
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

        uint rateInPRECISION;
        currentBlockNumber;

        require(qtyInSrcWei < MAX_QTY);
        uint eInFp = fromWeiToFp(reserveContract.balance);
        rateInPRECISION = getRateWithE(conversionToken, buy, qtyInSrcWei, eInFp);
        require(rateInPRECISION < MAX_RATE);
        return rateInPRECISION;
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
        collectedFeesInTwei += calcCollectedFee(abs(buyAmountInTwei));
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

        require(qtyInSrcWei < MAX_QTY);
        require(eInFp < maxQtyInFp);

        if (conversionToken != token) return 0;

        if (buy) {
            // ETH goes in, token goes out
            deltaEInFp = fromWeiToFp(qtyInSrcWei);
            if (deltaEInFp > maxCapBuyInFp) return 0;

            if (deltaEInFp == 0) {
                rateInPRECISION = buyRateZeroQuantity(eInFp);
            } else {
                rateInPRECISION = buyRate(eInFp, deltaEInFp);
            }
        } else {
            deltaTInFp = fromTweiToFp(qtyInSrcWei);
            deltaTInFp = reduceFee(deltaTInFp);
            if (deltaTInFp == 0) {
                rateInPRECISION = sellRateZeroQuantity(eInFp);
                deltaEInFp = 0;
            } else {
                (rateInPRECISION, deltaEInFp) = sellRate(eInFp, deltaTInFp);
            }

            if (deltaEInFp > maxCapSellInFp) return 0;
        }

        rateInPRECISION = validateRate(rateInPRECISION, buy);
        require(rateInPRECISION < MAX_RATE);
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
    }

    function buyRate(uint eInFp, uint deltaEInFp) public view returns(uint) {
        require(deltaEInFp < maxQtyInFp);
        require(eInFp < maxQtyInFp);
        uint deltaTInFp = deltaTFunc(rInFp, pMinInFp, eInFp, deltaEInFp, formulaPrecision);
        require(deltaTInFp < maxQtyInFp);
        deltaTInFp = reduceFee(deltaTInFp);
        return deltaTInFp * PRECISION / deltaEInFp;
    }

    function buyRateZeroQuantity(uint eInFp) public view returns(uint) {
        require(eInFp < maxQtyInFp);
        return formulaPrecision * PRECISION / PE(rInFp, pMinInFp, eInFp, formulaPrecision);
    }

    function sellRate(uint eInFp, uint deltaTInFp) public view returns(uint rateInPRECISION, uint deltaEInFp) {
        require(deltaTInFp < maxQtyInFp);
        require(eInFp < maxQtyInFp);
        deltaEInFp = deltaEFunc(rInFp, pMinInFp, eInFp, deltaTInFp, formulaPrecision, numFpBits);
        require(deltaEInFp < maxQtyInFp);
        rateInPRECISION = deltaEInFp * PRECISION / deltaTInFp;
    }

    function sellRateZeroQuantity(uint eInFp) public view returns(uint) {
        require(eInFp < maxQtyInFp);
        return PE(rInFp, pMinInFp, eInFp, formulaPrecision) * PRECISION / formulaPrecision;
    }

    function fromTweiToFp(uint qtyInTwei) public view returns(uint) {
        require(qtyInTwei < MAX_QTY);
        return qtyInTwei * formulaPrecision / (10 ** getDecimals(token));
    }

    function fromWeiToFp(uint qtyInwei) public view returns(uint) { 
        require(qtyInwei < MAX_QTY);
        return qtyInwei * formulaPrecision / (10**ETH_DECIMALS);
    }

    function reduceFee(uint val) public view returns(uint) {
        require( val < MAX_QTY);
        return ((10000 - feeInBps) * val) / 10000;
    }

    function calcCollectedFee(uint val) public view returns(uint) {
        require( val < MAX_QTY);
        return val * feeInBps / (10000 - feeInBps);
    }
 
    function abs(int val) public pure returns(uint) {
        if (val < 0) {
            return uint(val * (-1));
        } else { 
            return uint(val);
        }
    }

}