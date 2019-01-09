pragma solidity ^0.4.18;

import "../ERC20Interface.sol";
import "../KyberReserve.sol";
import "../KyberNetwork.sol";
import "../KyberNetworkProxy.sol";
import "../Utils.sol";
import "../ConversionRates.sol";
import "../permissionless/OrderbookReserve.sol";


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


    function getExpectedRates( KyberNetwork network, ERC20[] srcs, ERC20[] dests, uint[] qty )
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

    function getListPermissionlessTokensAndDecimals(KyberNetworkProxy networkProxy)
      public
      view
      returns(ERC20[] memory permissionlessTokens, uint[] memory decimals)
    {
        // Counting number of tokens in unofficial reserves (include duplicated)
        KyberNetwork network = KyberNetwork(networkProxy.kyberNetworkContract());
        uint numberTokens = 0;
        uint rID;
        ERC20 knc; ERC20 token; FeeBurnerRateInterface fee; address addr; MedianizerInterface median; OrderListFactoryInterface orderList;
        for(rID = 0; rID < network.getNumReserves(); rID++) {
            if (network.reserves(rID) != address(0) && network.reserveType(network.reserves(rID)) == KyberNetwork.ReserveType.PERMISSIONLESS) {
                // permissionless reserve
                (knc, token, fee, addr, median, orderList) = OrderbookReserve(network.reserves(rID)).contracts();
                if (token != address(0)) { numberTokens += 1; }
            }
        }
        ERC20[] memory listTokens = new ERC20[](numberTokens);
        numberTokens = 0;
        uint duplicatedTokens = 0;
        uint i;
        // getting list of tokens in unofficial reserves, counting number duplicated
        for(rID = 0; rID < network.getNumReserves(); rID++) {
            if (network.reserves(rID) != address(0) && network.reserveType(network.reserves(rID)) == KyberNetwork.ReserveType.PERMISSIONLESS) {
                // permissionless reserve
                (knc, token, fee, addr, median, orderList) = OrderbookReserve(network.reserves(rID)).contracts();
                if (token != address(0)) {
                    // check if duplicated
                    for(i = 0; i < numberTokens; i++) {
                        if (listTokens[i] == token) {
                            duplicatedTokens += 1;
                            break;
                        }
                    }
                    listTokens[numberTokens] = token;
                    numberTokens += 1;
                }
            }
        }
        permissionlessTokens = new ERC20[](numberTokens - duplicatedTokens);
        decimals = new uint[](numberTokens - duplicatedTokens);
        numberTokens = 0;
        // getting final list of tokens in unofficial reserves and decimals
        for(rID = 0; rID < network.getNumReserves(); rID++) {
            if (network.reserves(rID) != address(0) && network.reserveType(network.reserves(rID)) == KyberNetwork.ReserveType.PERMISSIONLESS) {
                // permissionless reserve
                (knc, token, fee, addr, median, orderList) = OrderbookReserve(network.reserves(rID)).contracts();
                if (token != address(0)) {
                    // check if duplicated
                    bool isDuplicated = false;
                    for(i = 0; i < numberTokens; i++) {
                        if (listTokens[i] == token) {
                            isDuplicated = true;
                            break;
                        }
                    }
                    if (!isDuplicated) {
                        permissionlessTokens[numberTokens] = token;
                        decimals[numberTokens] = getDecimals(token);
                        numberTokens += 1;
                    }
                }
            }
        }
        return (permissionlessTokens, decimals);
    }
}
