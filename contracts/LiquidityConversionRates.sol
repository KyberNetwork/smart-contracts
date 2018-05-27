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
    uint public maxRateInPRECISION;
    uint public minRateInPRECISION;
    address public reserveContract;

    function LiquidityConversionRates(address _admin, ERC20 _token, address _reserveContract) public {
        transferAdminQuickly(_admin);
        token = _token;
        reserveContract = _reserveContract;
        setDecimals(token);
    }

    event SetLiquidityParams(uint rInFp, uint PminInFp, uint numFpBits, uint maxCapBuyInFp, uint maxCapSellInFp, uint feeInBps, uint formulaPrecision, uint maxRateInPRECISION, uint minRateInPRECISION);

    function setLiquidityParams(uint _rInFp, uint _PminInFp, uint _numFpBits, uint _maxCapBuyInWei, uint _maxCapSellInWei, uint _feeInBps, uint _maxRateInPRECISION, uint _minRateInPRECISION) public onlyAdmin {
          rInFp = _rInFp;
          PminInFp = _PminInFp;
          formulaPrecision = uint(1)<<_numFpBits;
          numFpBits = _numFpBits;
          maxCapBuyInFp = fromWeiToFp(_maxCapBuyInWei, formulaPrecision);
          maxCapSellInFp = fromWeiToFp(_maxCapSellInWei, formulaPrecision);
          collectedFeesInTwei = 0;
          require(_feeInBps < 10000);
          feeInBps = _feeInBps;
          maxRateInPRECISION = _maxRateInPRECISION;
          minRateInPRECISION = _minRateInPRECISION;

          SetLiquidityParams(rInFp, PminInFp, numFpBits, maxCapBuyInFp, maxCapSellInFp, feeInBps, formulaPrecision, maxRateInPRECISION, minRateInPRECISION);
    }

    function getRateWithE(ERC20 conversionToken, bool buy, uint qtyInSrcWei, uint EInFp) public view returns(uint) {
        uint deltaEInFp;
        uint deltaTInFp;
        uint rateInPRECISION;
        uint maxCap;

        if(conversionToken != token) return 0;

        if(buy) {
          // ETH goes in, token goes out
          deltaEInFp = fromWeiToFp(qtyInSrcWei, formulaPrecision);

          if(deltaEInFp == 0) {
            rateInPRECISION = buyRateZeroQuantity(EInFp, rInFp, PminInFp, formulaPrecision, PRECISION);
          }
          else {
            rateInPRECISION = buyRate(feeInBps, deltaEInFp, EInFp, rInFp, PminInFp, formulaPrecision, PRECISION);
          }
          maxCap = maxCapBuyInFp;
        }
        else {
          deltaTInFp = fromTweiToFp(token, qtyInSrcWei, formulaPrecision);
          deltaTInFp = reduceFee(deltaTInFp, feeInBps);
          if(deltaTInFp == 0) {
              rateInPRECISION = sellRateZeroQuantity(EInFp, rInFp, PminInFp, formulaPrecision, PRECISION);
          }
          else {
            rateInPRECISION = sellRate(deltaTInFp, EInFp, rInFp, PminInFp, formulaPrecision, PRECISION, numFpBits);
          }
          maxCap = maxCapSellInFp;
        }

        if ((rateInPRECISION > maxRateInPRECISION) || (rateInPRECISION < minRateInPRECISION)) {
            return 0;
        }

        if(deltaEInFp > maxCap) return 0;
        return rateInPRECISION;
    }

    function getRate(ERC20 conversionToken, uint currentBlockNumber, bool buy, uint qtyInSrcWei) public view returns(uint) {

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

    function buyRate(uint _feeInBps, uint _deltaEInFp, uint _EInFp, uint _rInFp, uint _PminInFp, uint _formulaPrecision, uint _PRECISION) public pure returns(uint) {
        uint deltaTInFp = deltaTFunc(_rInFp,_PminInFp,_EInFp,_deltaEInFp,_formulaPrecision);
        deltaTInFp = reduceFee(deltaTInFp, _feeInBps);
        return deltaTInFp * _PRECISION / _deltaEInFp;
    }

    function buyRateZeroQuantity(uint _EInFp, uint _rInFp, uint _PminInFp, uint _formulaPrecision, uint _PRECISION) public pure returns(uint) {
        return PE(_rInFp, _PminInFp, _EInFp, _formulaPrecision) * _PRECISION / _formulaPrecision;
    }

    function sellRate(uint _deltaTInFp, uint _EInFp, uint _rInFp, uint _PminInFp, uint _formulaPrecision, uint _PRECISION, uint _numFpBits) public pure returns(uint) {
        uint deltaEInFp = deltaEFunc(_rInFp,_PminInFp,_EInFp,_deltaTInFp,_formulaPrecision,_numFpBits);
        return deltaEInFp * _PRECISION / _deltaTInFp;
    }

    function sellRateZeroQuantity(uint _EInFp, uint _rInFp, uint _PminInFp, uint _formulaPrecision, uint _PRECISION) public pure returns(uint) {
        return _formulaPrecision * _PRECISION / PE(_rInFp, _PminInFp, _EInFp, _formulaPrecision);
    }

    function fromTweiToFp(ERC20 _token, uint qtyInTwei, uint _formulaPrecision) public view returns(uint) {
        return qtyInTwei * _formulaPrecision / (10** getDecimals(_token));
    }

    function fromWeiToFp(uint qtyInwei, uint _formulaPrecision) public pure returns(uint) {
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