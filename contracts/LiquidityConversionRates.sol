pragma solidity ^0.4.18;

import "./ConversionRatesInterface.sol";
import "./LiquidityFormula.sol";
import "./Withdrawable.sol";
import "./Utils.sol";


contract LiquidityConversionRates is ConversionRatesInterface, LiquidityFormula, Withdrawable, Utils {
    ERC20 token;
    uint public rInFp;
    uint public PminInFp;
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
        // check that token decimals is smaller than max decimals (also from utils)
    }

    event SetLiquidityParams(uint rInFp,
                             uint PminInFp,
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

    function setLiquidityParams(uint _rInFp,
                                uint _PminInFp,
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
          PminInFp = _PminInFp;
          formulaPrecision = uint(1)<<_numFpBits; // validate _numFpBits smaller than 256.
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

          SetLiquidityParams(rInFp,
                             PminInFp,
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

    function getRateWithE(ERC20 conversionToken, bool buy, uint qtyInSrcWei, uint EInFp) public view returns(uint) {
        uint deltaEInFp;
        uint deltaTInFp;
        uint rateInPRECISION;
        uint maxCap;
        //TODO: also here qtyInSrcWei < maxQty. since public

        if(conversionToken != token) return 0;

        if(buy) {
          // ETH goes in, token goes out
          deltaEInFp = fromWeiToFp(qtyInSrcWei, formulaPrecision);

          if(deltaEInFp == 0) {
            rateInPRECISION = buyRateZeroQuantity(EInFp);
          }
          else {
            rateInPRECISION = buyRate(EInFp, deltaEInFp);
          }

          if ((rateInPRECISION > maxBuyRateInPRECISION) || (rateInPRECISION < minBuyRateInPRECISION)) {
            return minBuyRateInPRECISION;
          }
          maxCap = maxCapBuyInFp;
        }
        else {
          deltaTInFp = fromTweiToFp(token, qtyInSrcWei, formulaPrecision);
          deltaTInFp = reduceFee(deltaTInFp, feeInBps);
          if(deltaTInFp == 0) {
              rateInPRECISION = sellRateZeroQuantity(EInFp);
          }
          else {
            rateInPRECISION = sellRate(EInFp, deltaTInFp);
          }

          if ((rateInPRECISION > maxSellRateInPRECISION) || (rateInPRECISION < minSellRateInPRECISION)) {
            return minSellRateInPRECISION;
          }

          maxCap = maxCapSellInFp;
        }

        if(deltaEInFp > maxCap) return 0;
        return rateInPRECISION;
    }

    function getRate(ERC20 conversionToken, uint currentBlockNumber, bool buy, uint qtyInSrcWei) public view returns(uint) {

    //TODO: qtyInSrcWei < maxQty.
    //TODO: deltaT, deltaE < 10^30.

        currentBlockNumber;

        uint EInFp = fromWeiToFp(conversionToken.balance, formulaPrecision);

        return getRateWithE(token,buy,qtyInSrcWei,EInFp);
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
        collectedFeesInTwei += calcCollectedFee(abs(buyAmountInTwei),feeInBps);
    }

    event ResetCollectedFees(uint resetFeesInTwei);

    function resetCollectedFees() public onlyAdmin {
        uint resetFeesInTwei = collectedFeesInTwei;
        collectedFeesInTwei = 0;

        ResetCollectedFees(resetFeesInTwei);
    }

    function buyRate(uint _EInFp, uint _deltaEInFp) public view returns(uint) {
        uint deltaTInFp = deltaTFunc(rInFp,PminInFp,_EInFp,_deltaEInFp,formulaPrecision); // TODO: check if smaller than maxqty in precision (save in constructor maxqty in precision or divide each time, take it as constant from utils) 
        deltaTInFp = reduceFee(deltaTInFp, feeInBps);
        return deltaTInFp * PRECISION / _deltaEInFp;
    }

    function buyRateZeroQuantity(uint _EInFp) public view returns(uint) {
        return  formulaPrecision * PRECISION / PE(rInFp, PminInFp, _EInFp, formulaPrecision);
    }

    function sellRate(uint _EInFp, uint _deltaTInFp) public view returns(uint) {
        uint deltaEInFp = deltaEFunc(rInFp,PminInFp,_EInFp,_deltaTInFp,formulaPrecision,numFpBits);
        return deltaEInFp * PRECISION / _deltaTInFp;
    }

    function sellRateZeroQuantity(uint _EInFp) public view returns(uint) {
        return PE(rInFp, PminInFp, _EInFp, formulaPrecision) * PRECISION / formulaPrecision;
    }

    function fromTweiToFp(ERC20 _token, uint qtyInTwei, uint _formulaPrecision) public view returns(uint) {
        return qtyInTwei * _formulaPrecision / (10** getDecimals(_token));
    }

    function fromWeiToFp(uint qtyInwei, uint _formulaPrecision) public pure returns(uint) { // TODO: add requore that amount (input) is smaller than maxquantity 
        return qtyInwei * _formulaPrecision / (10**ETH_DECIMALS);
    }

    function reduceFee(uint val, uint _feeInBps) public pure returns(uint) {
        return ((10000 - _feeInBps) * val) / 10000;
    }

    function calcCollectedFee(uint val, uint _feeInBps) public pure returns(uint) {
        return val * _feeInBps / (10000 - _feeInBps);
        // 0.9975 = (10000 - fee) / 10000
        // fee = (input / 0.9975) - input
    }
 
    function abs(int val) public pure returns(uint) {
        if(val<0) {
            return uint(val * (-1));
        }
        else {
            return uint(val);
        }
    }

}