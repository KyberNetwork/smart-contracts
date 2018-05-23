pragma solidity ^0.4.18;

import "./ConversionRates.sol";
import "./LiquidityFormula.sol";

contract LiquidityConversionRates is ConversionRatesInterface, LiquidityFormula, Withdrawable, Utils {
    ERC20 token;
    uint public r;
    uint public Pmin;
    uint public qtyPrecision;
    uint public numPrecisionBits;
    uint public maxEthCapBuy;
    uint public maxEthCapSell;
    uint public collectedTokenFees;
    uint public feeInBps;

    function LiquidityConversionRates(address _admin) public{
        admin = _admin;
    }

    function setLiquidityParams(ERC20 _token, uint _r, uint _Pmin, uint _numPrecisionBits, uint _maxEthCapBuy, uint _maxEthCapSell, uint _feeInBps) public onlyAdmin {
          token = _token;
          setDecimals(token);
          r = _r;
          Pmin = _Pmin;
          qtyPrecision = uint(1)<<_numPrecisionBits;
          numPrecisionBits = _numPrecisionBits;
          maxEthCapBuy = fromWeiToQty(_maxEthCapBuy);
          maxEthCapSell = fromWeiToQty(_maxEthCapSell);
          collectedTokenFees = 0;
          require(_feeInBps < 10000);
          feeInBps = _feeInBps;
    }

    function getRateWithE(ERC20 conversionToken, bool buy, uint qty, uint E) public view returns(uint) {
        uint deltaE;
        uint deltaT;
        uint rate;
        uint maxCap;

        if(conversionToken != token) return 0;

        if(buy) {
          // ETH goes in, token goes out
          deltaE = fromWeiToQty(qty);
          if(deltaE == 0) deltaE = 1;

          deltaT = deltaTFunc(r,Pmin,E,deltaE,qtyPrecision);
          deltaT = reduceFee(deltaT);

          rate = deltaT * PRECISION / deltaE;

          maxCap = maxEthCapBuy;
        }
        else {
          deltaT = fromDecimalsToQty(qty);
          deltaT = reduceFee(deltaT);
          if(deltaT == 0) deltaT = 1;

          deltaE = deltaEFunc(r,Pmin,E,deltaT,qtyPrecision,numPrecisionBits);
          rate = deltaE * PRECISION / deltaT;

          maxCap = maxEthCapSell;
        }

        if(deltaE > maxCap) return 0;
        return rate;
    }

    function getRate(ERC20 conversionToken, uint currentBlockNumber, bool buy, uint qty) public view returns(uint) {

        currentBlockNumber;

        uint E = fromWeiToQty(conversionToken.balance);
        // Yaron - here we need to reduce what was calculated for fee? I think not since we deal with token fee now.

        return getRateWithE(token,buy,qty,E);
    }

    function recordImbalance(
        ERC20 conversionToken,
        int buyAmount,
        uint rateUpdateBlock,
        uint currentBlock
    )
        public
    {
        conversionToken;
        rateUpdateBlock;
        currentBlock;

        uint buyQty = fromDecimalsToQty(abs(buyAmount));
        uint feeQty = getFee(buyQty);
        collectedTokenFees += feeQty;

        // Yaron - do we need? -require(msg.sender == reserveContract);
        // Yaron - do we need? - if (rateUpdateBlock == 0) rateUpdateBlock = getRateUpdateBlock(token);
        // Yaron - do we need it - return addImbalance(token, buyAmount, rateUpdateBlock, currentBlock);
    }

    function resetCollectedFees() public {
        collectedTokenFees = 0;
    }

    function getCollectedFees() public view returns(uint) { //Yaron - Do we need it?
        return fromQtyToWei(collectedTokenFees);
    }

    function fromDecimalsToQty(uint amount) internal view returns(uint) {
        return amount * qtyPrecision / (10** getDecimals(token));
    }

    function fromWeiToQty(uint amount) internal view returns(uint) {
        return amount * qtyPrecision / (10**ETH_DECIMALS);
    }

    function fromQtyToWei(uint qty) internal view returns(uint) {
        return (qty * 10**ETH_DECIMALS) / qtyPrecision;
    }

    function reduceFee(uint val) internal view returns(uint) {
        return ((10000 - feeInBps) * val) / 10000;
    }

    function getFee(uint val) internal view returns(uint) {
        return (feeInBps * val) / 10000;
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