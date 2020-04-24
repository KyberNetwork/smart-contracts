pragma solidity ^0.4.18;

import "../ERC20Interface.sol";
import "../Utils.sol";
import "../reserves/fprConversionRate/ConversionRates.sol";
import "../reserves/orderBookReserve/permissionless/OrderbookReserve.sol";
import "../KyberNetworkInterface.sol";


contract NetworkInterface {

    enum ReserveType {NONE, PERMISSIONED, PERMISSIONLESS}

    KyberReserveInterface[] public reserves;
    mapping(address=>ReserveType) public reserveType;
    
    function maxGasPrice() public view returns(uint);
    function getUserCapInWei(address user) public view returns(uint);
    function getUserCapInTokenWei(address user, ERC20 token) public view returns(uint);
    function enabled() public view returns(bool);
    function info(bytes32 id) public view returns(uint);

    function getExpectedRate(ERC20 src, ERC20 dest, uint srcQty) public view
        returns (uint expectedRate, uint slippageRate);

    function tradeWithHint(address trader, ERC20 src, uint srcAmount, ERC20 dest, address destAddress,
        uint maxDestAmount, uint minConversionRate, address walletId, bytes hint) public payable returns(uint);
    function getNumReserves() public view returns(uint);
}


contract proxyInterface {
    KyberNetworkInterface public kyberNetworkContract;
}


contract Wrapper is Utils {

    function getBalances(address reserve, ERC20[] tokens) public view returns(uint[]) {
        uint[] memory result = new uint[](tokens.length);
        for (uint i = 0; i < tokens.length; i++) {
            uint balance = 0;
            if (tokens[i] == ETH_TOKEN_ADDRESS) {
                balance = reserve.balance;
            } else {
                balance = tokens[i].balanceOf(reserve);
            }

            result[i] = balance;
        }

        return result;
    }

    function getTokenAllowances(address owner, address spender, ERC20[] tokens) public view returns(uint[]) {
        uint[] memory result = new uint[](tokens.length);
        for (uint i = 0; i < tokens.length; i++) {
            result[i] = tokens[i].allowance(owner, spender);
        }
        return result;
    }

    function getByteFromBytes14(bytes14 x, uint byteInd) public pure returns(byte) {
        require(byteInd <= 13);
        return x[byteInd];
    }

    function getInt8FromByte(bytes14 x, uint byteInd) public pure returns(int8) {
        require(byteInd <= 13);
        return int8(x[byteInd]);
    }

//    struct TokenRatesCompactData {
//        bytes14 buy;  // change buy rate of token from baseBuyRate in 10 bps
//        bytes14 sell; // change sell rate of token from baseSellRate in 10 bps
//
//        uint32 blockNumber;
//    }
//
//    function getDataFromCompact(TokenRatesCompactData compact, uint byteInd) public pure
//        returns(int8 buyByte, int8 sellByte, uint blockNumber)
//    {
//        blockNumber = uint(compact.blockNumber);
////        return (compact.buy[byteInd], compact.sell[byteInd], uint(compact.blockNumber));
//    }

    function getCompactData(ConversionRates ratesContract, ERC20 token) internal view returns(int8,int8,uint) {
        uint bulkIndex; uint index; byte buy; byte sell; uint updateBlock;
        (bulkIndex, index, buy, sell) = ratesContract.getCompactData(token);
        updateBlock = ratesContract.getRateUpdateBlock(token);

        return (int8(buy), int8(sell), updateBlock);
    }

    function getTokenRates(ConversionRates ratesContract, ERC20[] tokenList)
        public view
        returns(uint[], uint[], int8[], int8[], uint[])
    {
        uint[] memory buyBases = new uint[](tokenList.length);
        uint[] memory sellBases = new uint[](tokenList.length);
        int8[] memory compactBuy = new int8[](tokenList.length);
        int8[] memory compactSell = new int8[](tokenList.length);
        uint[] memory updateBlock = new uint[](tokenList.length);

        for (uint i = 0;  i < tokenList.length; i++) {
            buyBases[i] = ratesContract.getBasicRate(tokenList[i], true);
            sellBases[i] = ratesContract.getBasicRate(tokenList[i], false);

            (compactBuy[i], compactSell[i], updateBlock[i]) = getCompactData(ratesContract, tokenList[i]);
        }

        return (buyBases, sellBases, compactBuy, compactSell, updateBlock);
    }

    function getTokenIndicies(ConversionRates ratesContract, ERC20[] tokenList) public view returns(uint[], uint[]) {
        uint[] memory bulkIndices = new uint[](tokenList.length);
        uint[] memory tokenIndexInBulk = new uint[](tokenList.length);

        for (uint i = 0; i < tokenList.length; i++) {
            uint bulkIndex; uint index; byte buy; byte sell;
            (bulkIndex, index, buy, sell) = ratesContract.getCompactData(tokenList[i]);

            bulkIndices[i] = bulkIndex;
            tokenIndexInBulk[i] = index;
        }

        return (bulkIndices,tokenIndexInBulk);
    }


    function getExpectedRates( NetworkInterface network, ERC20[] srcs, ERC20[] dests, uint[] qty )
        public view returns(uint[], uint[])
    {
        require( srcs.length == dests.length );
        require( srcs.length == qty.length );

        uint[] memory rates = new uint[](srcs.length);
        uint[] memory slippage = new uint[](srcs.length);
        for ( uint i = 0; i < srcs.length; i++ ) {
            (rates[i],slippage[i]) = network.getExpectedRate(srcs[i],dests[i],qty[i]);
        }

        return (rates, slippage);
    }

    // iterate from startIndex to endIndex inclusive
    function getListPermissionlessTokensAndDecimals(
      proxyInterface networkProxy,
      uint startIndex,
      uint endIndex
    )
      public
      view
      returns (ERC20[] memory permissionlessTokens, uint[] memory decimals, bool isEnded)
    {
        NetworkInterface network = NetworkInterface(networkProxy.kyberNetworkContract());
        uint numReserves = network.getNumReserves();
        if (startIndex >= numReserves || startIndex > endIndex) {
            // no need to iterate
            permissionlessTokens = new ERC20[](0);
            decimals = new uint[](0);
            isEnded = true;
            return (permissionlessTokens, decimals, isEnded);
        }
        uint endIterator = numReserves <= endIndex ? numReserves - 1 : endIndex;
        uint numberTokens = 0;
        uint rID; // reserveID
        ERC20 token;
        KyberReserveInterface reserve;
        // count number of tokens in unofficial reserves
        for(rID = startIndex; rID <= endIterator; rID++) {
            reserve = network.reserves(rID);
            if ( reserve != address(0)
              && network.reserveType(reserve) == NetworkInterface.ReserveType.PERMISSIONLESS)
            {
                // permissionless reserve
                (, token , , , ,) = OrderbookReserve(reserve).contracts();
                if (token != address(0)) { numberTokens += 1; }
            }
        }
        permissionlessTokens = new ERC20[](numberTokens);
        decimals = new uint[](numberTokens);
        numberTokens = 0;
        // get final list of tokens and decimals in unofficial reserves
        for(rID = startIndex; rID <= endIterator; rID++) {
            reserve = network.reserves(rID);
            if ( reserve != address(0)
              && network.reserveType(reserve) == NetworkInterface.ReserveType.PERMISSIONLESS)
            {
                // permissionless reserve
                (, token , , , ,) = OrderbookReserve(reserve).contracts();
                if (token != address(0)) {
                    permissionlessTokens[numberTokens] = token;
                    decimals[numberTokens] = getDecimals(token);
                    numberTokens += 1;
                }
            }
        }
        isEnded = endIterator == numReserves - 1;
        return (permissionlessTokens, decimals, isEnded);
    }
}
