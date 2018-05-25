pragma solidity ^0.4.18;

import "./ConversionRates.sol";
import "./LiquidityFormula.sol";

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
    address public reserveContract;

    function LiquidityConversionRates(address _admin) public{
        transferAdminQuickly(_admin);
    }

    event SetLiquidityParams(ERC20 token, uint rInFp, uint PminInFp, uint numFpBits, uint maxCapBuyInFp, uint maxCapSellInFp, uint feeInBps, uint formulaPrecision);

    function setLiquidityParams(ERC20 _token, uint _rInFp, uint _PminInFp, uint _numFpBits, uint _maxCapBuyInWei, uint _maxCapSellInWei, uint _feeInBps) public onlyAdmin {
          token = _token;
          setDecimals(token);
          rInFp = _rInFp;
          PminInFp = _PminInFp;
          formulaPrecision = uint(1)<<_numFpBits;
          numFpBits = _numFpBits;
          maxCapBuyInFp = fromWeiToFp(_maxCapBuyInWei);
          maxCapSellInFp = fromWeiToFp(_maxCapSellInWei);
          collectedFeesInTwei = 0;
          require(_feeInBps < 10000);
          feeInBps = _feeInBps;

          SetLiquidityParams(token, rInFp, PminInFp, numFpBits, maxCapBuyInFp, maxCapSellInFp, feeInBps, formulaPrecision);
    }

    function getRateWithE(ERC20 conversionToken, bool buy, uint qtyInSrcWei, uint EInFp) public view returns(uint) {
        uint deltaEInFp;
        uint deltaTInFp;
        uint rateInPRECISION;
        uint maxCap;

        if(conversionToken != token) return 0;

        if(buy) {
          // ETH goes in, token goes out
          deltaEInFp = fromWeiToFp(qtyInSrcWei);

          if(deltaEInFp == 0) {
            rateInPRECISION = buyRateZeroQuantity(EInFp);
          }
          else {
            rateInPRECISION = buyRate(EInFp, deltaEInFp);
          }
          maxCap = maxCapBuyInFp;
        }
        else {
          deltaTInFp = fromTweiToFp(qtyInSrcWei);
          deltaTInFp = reduceFee(deltaTInFp);
          if(deltaTInFp == 0) {
              rateInPRECISION = sellRateZeroQuantity(EInFp);
          }
          else {
            rateInPRECISION = sellRate(EInFp, deltaTInFp);
          }
          maxCap = maxCapSellInFp;
        }

        if(deltaEInFp > maxCap) return 0;
        return rateInPRECISION;
    }

    function getRate(ERC20 conversionToken, uint currentBlockNumber, bool buy, uint qtyInSrcWei) public view returns(uint) {

        currentBlockNumber;

        uint EInFp = fromWeiToFp(conversionToken.balance);

        return getRateWithE(token,buy,qtyInSrcWei,EInFp);
    }

    function setReserveAddress(address reserve) public onlyAdmin {
        reserveContract = reserve;
        //TODO - event
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

    event ResetCollectedFees(uint resetFeesInTwei);

    function resetCollectedFees() public onlyAdmin {
        uint resetFeesInTwei = collectedFeesInTwei;
        collectedFeesInTwei = 0;

        ResetCollectedFees(resetFeesInTwei);
    }

    function buyRate(uint EInFp, uint deltaEInFp) internal view returns(uint) {
        uint deltaTInFp = deltaTFunc(rInFp,PminInFp,EInFp,deltaEInFp,formulaPrecision);
        deltaTInFp = reduceFee(deltaTInFp);
        return deltaTInFp * PRECISION / deltaEInFp;
    }

    function buyRateZeroQuantity(uint EInFp) internal view returns(uint) {
        return PE(rInFp, PminInFp, EInFp, formulaPrecision) * PRECISION / formulaPrecision;
    }

    function sellRate(uint EInFp, uint deltaTInFp) internal view returns(uint) {
        uint deltaEInFp = deltaEFunc(rInFp,PminInFp,EInFp,deltaTInFp,formulaPrecision,numFpBits);
        return deltaEInFp * PRECISION / deltaTInFp;
    }

    function sellRateZeroQuantity(uint EInFp) internal view returns(uint) {
        return formulaPrecision * PRECISION / PE(rInFp, PminInFp, EInFp, formulaPrecision);
    }

    function fromTweiToFp(uint qtyInTwei) internal view returns(uint) { // TODO public, all view/pure..
        return qtyInTwei * formulaPrecision / (10** getDecimals(token));
    }

    function fromWeiToFp(uint qtyInwei) internal view returns(uint) {
        return qtyInwei * formulaPrecision / (10**ETH_DECIMALS);
    }

    function fromFpToWei(uint qtyInFp) internal view returns(uint) {
        return (qtyInFp * 10**ETH_DECIMALS) / formulaPrecision;
    }

    function reduceFee(uint val) internal view returns(uint) {
        return ((10000 - feeInBps) * val) / 10000;
    }

    function calcCollectedFee(uint val) internal view returns(uint) {
        return val * (10000 - feeInBps) / 10000;
    }
 
    function abs(int val) internal pure returns(uint) {
        if(val<0) {
            return uint(val * (-1));
        }
        else {
            return uint(val);
        }
    }

}