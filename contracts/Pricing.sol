pragma solidity ^0.4.18;

import "./ERC20Interface.sol";
import "./PermissionGroups.sol";
import "./VolumeImbalanceRecorderInterface.sol";


contract Pricing is VolumeImbalanceRecorderInterface, PermissionGroups {
  struct StepFunction {
    int[] x;
    int[] y;
  }

  function executeStepFunction( StepFunction f, int x ) pure internal returns(int) {
    uint len = f.y.length;
    for( uint ind = 0 ; ind < len ; ind++ ) {
      if(x <= f.x[ind]) return f.y[ind];
    }

    return f.y[len-1];
  }

  struct TokenData {
    bool listed; // was added to reserve
    bool enabled; // whether trade is enabled

    // position in the compact data
    uint compactDataArrayIndex;
    uint compactDataFieldIndex;

    // slowly change data
    uint baseBuyPrice;
    uint baseSellPrice;
    StepFunction buyPriceQtyStepFunction;
    StepFunction sellPriceQtyStepFunction;
    StepFunction buyPriceImbalanceStepFunction;
    StepFunction sellPriceImbalanceStepFunction;
  }

  uint constant public NUM_TOKENS_IN_COMPACT_DATA = 14;

  struct TokenPricesCompactData {
    bytes14 buy; // change in price of token i from base price in 10 bps
    bytes14 sell;  // change from base price in 10 bps

    uint32 blockNumber;
  }

  mapping(address=>TokenData) tokenData;
  TokenPricesCompactData[] tokenPricesCompactData;
  uint public numTokensInCurrentCompactData = 0;

  function addToken( ERC20 token ) public onlyAdmin {
    require(!tokenData[token].listed);

    if( numTokensInCurrentCompactData == 0 ) {
      tokenPricesCompactData.length++; // add new structure
    }

    tokenData[token].compactDataArrayIndex = tokenPricesCompactData.length - 1;
    tokenData[token].compactDataFieldIndex = numTokensInCurrentCompactData;

    numTokensInCurrentCompactData = (numTokensInCurrentCompactData + 1) %
      NUM_TOKENS_IN_COMPACT_DATA;
  }

  function addBps( uint price, int bps ) public pure returns(uint){
    uint maxBps = 100 * 100;
    require(bps <= maxBps);
    return (price * (int(maxBps) + bps))/maxBps;
  }

  function abs(int x) public pure returns(uint) {
    if( x < 0 ) return uint(-1*x);
    else return uint(x);
  }

  function getPrice( ERC20 token, uint currentBlockNumber, bool buy, uint qty ) public view returns(uint) {
    // check if trade is enabled
    if( ! tokenData[token].enabled ) return 0;

    // get price update block
    TokenPricesCompactData memory compactData = tokenPricesCompactData[tokenData[token].compactDataArrayIndex];

    uint updatePriceBlock = uint(compactData.blockNumber);
    if( currentBlockNumber >= updatePriceBlock + TODO ) return 0; // price is expired

    // check imbalance
    int totalImbalance; int blockImbalance;
    (totalImbalance, blockImbalance) = getImbalance(token, priceUpdateBlock, currentBlock);

    int imbalanceQty = int(qty);
    if( ! buy ) imbalanceQty *= -1;

    if( abs(totalImbalance + imbalanceQty) >= getMaxTotalImbalance() ) return 0;
    if( abs(blockImbalance + imbalanceQty) >= getMaxPerBlockImbalance() ) return 0;

    // calculate actual price
    int extraBps;
    if( buy ) {
      // start with base price
      uint buyPrice = tokenData[token].baseBuyPrice;

      // add qty overhead
      extraBps = executeStepFunction(tokenData[token].buyPriceQtyStepFunction,qty);
      buyPrice = addBps( buyPrice, extraBps );

      // add imbalance overhead
      extraBps = executeStepFunction(tokenData[token].buyPriceImbalanceStepFunction,totalImbalance);
      buyPrice = addBps( buyPrice, extraBps );

      // add price update
      int8 priceUpdate = int8(compactData.buy[tokenData[token].compactDataFieldIndex]);
      extraBps = priceUpdate * 10;
      buyPrice = addBps( buyPrice, extraBps );

      return buyPrice;
  }
  else {
    // start with base price
    uint sellPrice = tokenData[token].baseSellPrice;

    // add qty overhead
    extraBps = executeStepFunction(tokenData[token].sellPriceQtyStepFunction,qty);
    sellPrice = addBps( sellPrice, extraBps );

    // add imbalance overhead
    extraBps = executeStepFunction(tokenData[token].sellPriceImbalanceStepFunction,totalImbalance);
    sellPrice = addBps( sellPrice, extraBps );

    // add price update
    int8 priceUpdate = int8(compactData.sell[tokenData[token].compactDataFieldIndex]);
    extraBps = priceUpdate * 10;
    sellPrice = addBps( sellPrice, extraBps );

    return sellPrice;
  }

  function setCompactData( bytes14 buy[], bytes14 sell[], uint blockNumber, uint[] indices )
    public onlyOperator {
      require(buy.length == sell.length);
      require(indices.length == buy.length);

      uint32 blockNumber32bits = uint32(blockNumber);

      for( uint i = 0 ; i < indices.length ; i++ ) {
        tokenPricesCompactData[indices[i]] =
          TokenPricesCompactData(buy[i],sell[i],blockNumber32bits);
      }
  }

  function setBasePrice( ERC20 token,
                         uint baseBuy,
                         uint baseSell,
                         bytes14 buy,
                         bytes14 sell,
                         uint blockNumber ) pubic onlyOperator {

    tokenData[token].baseBuyPrice = baseBuy;
    tokenData[token].baseSellPrice = baseSell;

    uint index = tokenData[token].compactDataArrayIndex;
    tokenPricesCompactData[index] =
      TokenPricesCompactData(buy,sell,uint32(blockNumber));
  }

  function setQtyStepFunction( ERC20 token,
                               int[] xBuy,
                               int[] yBuy,
                               int[] xSell,
                               int[] ySell ) public onlyOperator {
    tokenData[token].buyPriceQtyStepFunction = StepFunction( xBuy, yBuy );
    tokenData[token].sellPriceQtyStepFunction = StepFunction( xSell, ySell );
  }

  function setImbalanceStepFunction( ERC20 token,
                                     int[] xBuy,
                                     int[] yBuy,
                                     int[] xSell,
                                     int[] ySell ) public onlyOperator {
    tokenData[token].buyPriceImbalanceStepFunction = StepFunction( xBuy, yBuy );
    tokenData[token].sellPriceImbalanceStepFunction = StepFunction( xSell, ySell );
  }
}
