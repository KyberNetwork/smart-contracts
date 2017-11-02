pragma solidity ^0.4.8;

import "./ERC20Interface.sol";
import "./KyberReserve.sol";

contract Wrapper {
  function getBalances( address reserve, ERC20[] tokens ) constant returns(uint[]){
    uint[] result;
    for( uint i = 0 ; i < tokens.length ; i++ ) {
      uint balance = 0;
      if( tokens[i] == ERC20(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee) ) {
        balance = reserve.balance;
      }
      else {
        balance = tokens[i].balanceOf(reserve);
      }

      result.push(balance);
    }

    return result;
  }

  function getPrices( KyberReserve reserve, ERC20[] sources, ERC20[] dests )
    constant returns(uint[], uint[], uint[]) {
      require( sources.length == dests.length );
      uint[][3] rates;
      // using 3 different arrays somehow makes them linked to each other
      // uint[] rates;
      // uint[] expBlocks;
      // uint[] balances;
      for( uint i = 0 ; i < sources.length ; i++ ) {
        uint rate; uint expBlock; uint balance;
        (rate,expBlock,balance) = reserve.getPairInfo( sources[i], dests[i] );
        rates[0].push(rate);
        rates[1].push(expBlock);
        rates[2].push(balance);
        // rates.push(rate);
        // expBlocks.push(expBlock);
        // balances.push(balance);
      }

      //return (rates,expBlocks,balances);
      return (rates[0],rates[1],rates[2]);
    }
}
