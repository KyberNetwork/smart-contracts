pragma solidity 0.4.18;

import "./ConversionRatesInterface.sol";
import "./LiquidityFormula.sol";
import "./Withdrawable.sol";
import "./Utils.sol";


contract LiquidityConversionRates is ConversionRatesInterface, LiquidityFormula, Withdrawable, Utils {
    ERC20 public token;
    address public reserveContract;

    uint public numFpBits;
    uint public formulaPrecision;

    uint public rInFp;
    uint public pMinInFp;

    uint public maxEthCapBuyInFp;
    uint public maxEthCapSellInFp;
    uint public maxQtyInFp;

    uint public feeInBps;
    uint public collectedFeesInTwei;

    uint public maxBuyRateInPrecision;
    uint public minBuyRateInPrecision;
    uint public maxSellRateInPrecision;
    uint public minSellRateInPrecision;

    function LiquidityConversionRates(address _admin, ERC20 _token) public {
        transferAdminQuickly(_admin);
        token = _token;
        setDecimals(token);
        require(getDecimals(token) <= MAX_DECIMALS);
    }

    event ReserveAddressSet(address reserve);

    function setReserveAddress(address reserve) public onlyAdmin {
        reserveContract = reserve;
        ReserveAddressSet(reserve);
    }

    event LiquidityParamsSet(
        uint rInFp,
        uint pMinInFp,
        uint numFpBits,
        uint maxCapBuyInFp,
        uint maxEthCapSellInFp,
        uint feeInBps,
        uint formulaPrecision,
        uint maxQtyInFp,
        uint maxBuyRateInPrecision,
        uint minBuyRateInPrecision,
        uint maxSellRateInPrecision,
        uint minSellRateInPrecision
    );

    function setLiquidityParams(
        uint _rInFp,
        uint _pMinInFp,
        uint _numFpBits,
        uint _maxCapBuyInWei,
        uint _maxCapSellInWei,
        uint _feeInBps,
        uint _maxBuyRateInPrecision,
        uint _minBuyRateInPrecision,
        uint _maxSellRateInPrecision,
        uint _minSellRateInPrecision
    ) public onlyAdmin {

        rInFp = _rInFp;
        pMinInFp = _pMinInFp;
        require(_numFpBits < 256);
        formulaPrecision = uint(1)<<_numFpBits;
        require(formulaPrecision < MAX_QTY);
        maxQtyInFp = MAX_QTY / formulaPrecision;
        numFpBits = _numFpBits;
        maxEthCapBuyInFp = fromWeiToFp(_maxCapBuyInWei);
        maxEthCapSellInFp = fromWeiToFp(_maxCapSellInWei);
        collectedFeesInTwei = 0;
        require(_feeInBps < 10000);
        feeInBps = _feeInBps;
        maxBuyRateInPrecision = _maxBuyRateInPrecision;
        minBuyRateInPrecision = _minBuyRateInPrecision;
        maxSellRateInPrecision = _maxSellRateInPrecision;
        minSellRateInPrecision = _minSellRateInPrecision;

        LiquidityParamsSet(
            rInFp,
            pMinInFp,
            numFpBits,
            maxEthCapBuyInFp,
            maxEthCapSellInFp,
            feeInBps,
            formulaPrecision,
            maxQtyInFp,
            maxBuyRateInPrecision,
            minBuyRateInPrecision,
            maxSellRateInPrecision,
            minSellRateInPrecision
        );
    }

    function getRate(
            ERC20 conversionToken,
            uint currentBlockNumber,
            bool buy,
            uint qtyInSrcWei
    ) public view returns(uint) {

        currentBlockNumber;

        require(qtyInSrcWei < MAX_QTY);
        uint eInFp = fromWeiToFp(reserveContract.balance);
        uint rateInPrecision = getRateWithE(conversionToken, buy, qtyInSrcWei, eInFp);
        require(rateInPrecision < MAX_RATE);
        return rateInPrecision;
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
        uint rateInPrecision;

        require(qtyInSrcWei < MAX_QTY);
        require(eInFp < maxQtyInFp);

        if (conversionToken != token) return 0;

        if (buy) {
            // ETH goes in, token goes out
            deltaEInFp = fromWeiToFp(qtyInSrcWei);
            if (deltaEInFp > maxEthCapBuyInFp) return 0;

            if (deltaEInFp == 0) {
                rateInPrecision = buyRateZeroQuantity(eInFp);
            } else {
                rateInPrecision = buyRate(eInFp, deltaEInFp);
            }
        } else {
            deltaTInFp = fromTweiToFp(qtyInSrcWei);
            deltaTInFp = reduceFee(deltaTInFp);
            if (deltaTInFp == 0) {
                rateInPrecision = sellRateZeroQuantity(eInFp);
                deltaEInFp = 0;
            } else {
                (rateInPrecision, deltaEInFp) = sellRate(eInFp, deltaTInFp);
            }

            if (deltaEInFp > maxEthCapSellInFp) return 0;
        }

        rateInPrecision = rateAfterMinMaxValidation(rateInPrecision, buy);
        require(rateInPrecision < MAX_RATE);
        return rateInPrecision;
    }

    function rateAfterMinMaxValidation(uint rateInPrecision, bool buy) public view returns(uint) {
        uint minAllowRateInPrecision;
        uint maxAllowedRateInPrecision;

        if (buy) {
            minAllowRateInPrecision = minBuyRateInPrecision;
            maxAllowedRateInPrecision = maxBuyRateInPrecision;
        } else {
            minAllowRateInPrecision = minSellRateInPrecision;
            maxAllowedRateInPrecision = maxSellRateInPrecision;
        }

        if ((rateInPrecision > maxAllowedRateInPrecision) || (rateInPrecision < minAllowRateInPrecision)) {
            return 0;
        } else {
            return rateInPrecision;
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

    function sellRate(uint eInFp, uint deltaTInFp) public view returns(uint rateInPrecision, uint deltaEInFp) {
        require(deltaTInFp < maxQtyInFp);
        require(eInFp < maxQtyInFp);
        deltaEInFp = deltaEFunc(rInFp, pMinInFp, eInFp, deltaTInFp, formulaPrecision, numFpBits);
        require(deltaEInFp < maxQtyInFp);
        rateInPrecision = deltaEInFp * PRECISION / deltaTInFp;
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
        require(val < MAX_QTY);
        return ((10000 - feeInBps) * val) / 10000;
    }

    function calcCollectedFee(uint val) public view returns(uint) {
        require(val < MAX_QTY);
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