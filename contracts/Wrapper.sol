pragma solidity ^0.4.18;

import "./ERC20Interface.sol";
import "./KyberReserve.sol";
import "./KyberConstants.sol";
import "./Pricing.sol";

contract Wrapper is KyberConstants {
    function getBalances( address reserve, ERC20[] tokens ) public constant returns(uint[]){
        uint[] memory result = new uint[](tokens.length);
        for( uint i = 0 ; i < tokens.length ; i++ ) {
            uint balance = 0;
            if( tokens[i] == ETH_TOKEN_ADDRESS ) {
                balance = reserve.balance;
            }
            else {
                balance = tokens[i].balanceOf(reserve);
            }

            result[i] = balance;
        }

        return result;
    }

    function getByteFromBytes14( bytes14 x, uint byteInd ) public pure returns(byte) {
      return x[byteInd];
    }

    function getIntFromByte( bytes14 x, uint byteInd ) public pure returns(int) {
      return int(int8(x[byteInd]));
    }

    function getTokenRates( Pricing pricingContract, ERC20[] tokenList ) public view returns(uint[],uint[],int8[],int8[]) {
      uint[] memory buyBases = new uint[](tokenList.length);
      uint[] memory sellBases = new uint[](tokenList.length);
      int8[] memory compactBuy = new int8[](tokenList.length);
      int8[] memory compactSell = new int8[](tokenList.length);

      for( uint i = 0 ;  i < tokenList.length ; i++ ) {
        buyBases[i] = pricingContract.getBasicPrice(tokenList[i],true);
        sellBases[i] = pricingContract.getBasicPrice(tokenList[i],false);

        uint bulkIndex; uint index; byte buy; byte sell;
        (bulkIndex, index, buy, sell) = pricingContract.getCompactData(tokenList[i]);
        compactBuy[i] = int8(buy);
        compactSell[i] = int8(sell);
      }

      return (buyBases,sellBases,compactBuy,compactSell);
    }

    function getTokenIndicies( Pricing pricingContract, ERC20[] tokenList ) public view returns(uint[],uint[]) {
      uint[] memory bulkIndices = new uint[](tokenList.length);
      uint[] memory tokenIndexInBulk = new uint[](tokenList.length);

      for( uint i = 0 ; i < tokenList.length ; i++ ) {
        uint bulkIndex; uint index; byte buy; byte sell;
        (bulkIndex, index, buy, sell) = pricingContract.getCompactData(tokenList[i]);

        bulkIndices[i] = bulkIndex;
        tokenIndexInBulk[i] = index;
      }

      return (bulkIndices,tokenIndexInBulk);
    }


/*
    function getPrices( KyberReserve reserve, ERC20[] sources, ERC20[] dests )
        public constant returns(uint[], uint[], uint[])
    {
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

        return (rates, expBlocks, balances);
    }*/
}
