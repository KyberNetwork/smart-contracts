pragma solidity ^0.4.8;

import "./ERC20Interface.sol";
import "./KyberReserve.sol";

contract Wrapper {
  function getBalances( address reserve, ERC20[] tokens ) constant returns(uint[]){
    uint[] memory result = new uint[](tokens.length);
    for( uint i = 0 ; i < tokens.length ; i++ ) {
      uint balance = 0;
      if( tokens[i] == ERC20(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee) ) {
        balance = reserve.balance;
      }
      else {
        balance = tokens[i].balanceOf(reserve);
      }

      result[i] = balance;
    }

    return result;
  }

  function getPrices( KyberReserve reserve, ERC20[] sources, ERC20[] dests )
    constant returns(uint[], uint[], uint[]) {
      require( sources.length == dests.length );
      uint[] memory rates = new uint[](sources.length);
      uint[] memory expBlocks = new uint[](sources.length);
      uint[] memory balances = new uint[](sources.length);
      for( uint i = 0 ; i < sources.length ; i++ ) {
        uint rate; uint expBlock; uint balance;
        (rate,expBlock,balance) = reserve.getPairInfo( sources[i], dests[i] );
        rates[i] = rate;
        expBlocks[i] = expBlock;
        balances[i] = balance;
      }

      return (rates,expBlocks,balances);
    }
}
