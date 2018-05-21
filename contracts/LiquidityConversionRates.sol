pragma solidity ^0.4.18;

import "./ConversionRates.sol";
import "./LiquidityFormula.sol";

contract LiquidityConversionRates is ConversionRates, LiquidityFormula {
    uint public r;
    uint public Pmin;
    uint public precision;
    uint public numPrecisionBits;


    function LiquidityConversionRates(address _admin) public ConversionRates(_admin)
        { } // solhint-disable-line no-empty-blocks

    function setLiquidityParams(uint _r, uint _Pmin,uint _numPrecisionBits) public onlyAdmin {
          r = _r;
          Pmin = _Pmin;
          precision = uint(1)<<_numPrecisionBits;
          numPrecisionBits = _numPrecisionBits;
    }

    function getRateWithE(ERC20 token, uint currentBlockNumber, bool buy, uint qty, uint E) public view returns(uint) {
        uint deltaE;
        uint deltaT;
        uint rate;

        currentBlockNumber;

        if(buy) {
          // ETH goes in, token goes out
          deltaE = qty * precision / 10**ETH_DECIMALS;
          if(deltaE == 0) return 0;

          deltaT = deltaTFunc(r,Pmin,E,deltaE,precision);

          rate = deltaT * PRECISION / deltaE;
        }
        else {
          deltaT = qty * precision / (10** getDecimals(token));
          if(deltaT == 0) return 0;

          deltaE = deltaEFunc(r,Pmin,E,deltaT,precision,numPrecisionBits);
          rate = deltaE * PRECISION / deltaT;
        }

        // TODO - check imbalance

        return rate;
    }

    function getRate(ERC20 token, uint currentBlockNumber, bool buy, uint qty) public view returns(uint) {
        uint E = reserveContract.balance * precision / 10**ETH_DECIMALS;

        return getRateWithE(token,currentBlockNumber,buy,qty,E);
    }
}
