pragma solidity ^0.4.18;


import "./ERC20Interface.sol";
import "./VolumeImbalanceRecorder.sol";


contract Pricing is VolumeImbalanceRecorder {

    // bps - basic price steps. one step is 1 / 10000 of the price.
    struct StepFunction {
        int[] x; // quantity for each step. Quantity of each step includes previous steps.
        int[] y; // price change per quantity step  in bps.
    }

    struct TokenData {
        bool listed;  // was added to reserve
        bool enabled; // whether trade is enabled

        // position in the compact data
        uint compactDataArrayIndex;
        uint compactDataFieldIndex;

        // price data. base and changes according to quantity and reserve balance.
        // generally speaking. Sell price is 1 / buy price i.e. the buy in the other direction.
        uint baseBuyPrice;  // in PRECISION units. see KyberConstants
        uint baseSellPrice; // PRECISION units. without (sell / buy) spread it is 1 / baseBuyPrice
        StepFunction buyPriceQtyStepFunction; // in bps. higher quantity - bigger the price.
        StepFunction sellPriceQtyStepFunction;// in bps. higher the qua
        StepFunction buyPriceImbalanceStepFunction; // in BPS. higher reserve imbalance - bigger the price.
        StepFunction sellPriceImbalanceStepFunction;
    }

    struct TokenPricesCompactData {
        bytes14 buy;  // change buy price of token from baseBuyPrice in 10 bps
        bytes14 sell; // change sell price of token from baseSellPrice in 10 bps

        uint32 blockNumber;
    }

    uint public validPriceDurationInBlocks = 10; // prices are valid for this amount of blocks
    mapping(address=>TokenData) tokenData;
    TokenPricesCompactData[] tokenPricesCompactData;
    uint public numTokensInCurrentCompactData = 0;
    address public reserveContract;
    uint constant NUM_TOKENS_IN_COMPACT_DATA = 14;

    function Pricing(address _admin) public VolumeImbalanceRecorder(_admin) { }

    function addToken(ERC20 token) public onlyAdmin {

        require(!tokenData[token].listed);
        tokenData[token].listed = true;

        if(numTokensInCurrentCompactData == 0) {
            tokenPricesCompactData.length++; // add new structure
        }

        tokenData[token].compactDataArrayIndex = tokenPricesCompactData.length - 1;
        tokenData[token].compactDataFieldIndex = numTokensInCurrentCompactData;

        numTokensInCurrentCompactData = (numTokensInCurrentCompactData + 1) % NUM_TOKENS_IN_COMPACT_DATA;

        setGarbageToVolumeRecorder(token);
    }

    function setCompactData(bytes14[] buy, bytes14[] sell, uint blockNumber, uint[] indices) public onlyOperator {

        require(buy.length == sell.length);
        require(indices.length == buy.length);

        uint32 blockNumber32bits = uint32(blockNumber);

        for(uint i = 0; i < indices.length; i++) {
            require(indices[i] < tokenPricesCompactData.length);
            tokenPricesCompactData[indices[i]] = TokenPricesCompactData(buy[i], sell[i], blockNumber32bits);
        }
    }

    function setBasePrice(
        ERC20[] tokens,
        uint[] baseBuy,
        uint[] baseSell,
        bytes14[] buy,
        bytes14[] sell,
        uint blockNumber,
        uint[] indices
    )
        public
        onlyOperator
    {
        require(tokens.length == baseBuy.length);
        require(tokens.length == baseSell.length);
        require(sell.length == buy.length);
        require(sell.length == indices.length);

        for(uint ind = 0; ind < tokens.length; ind++) {
            require(tokenData[tokens[ind]].listed);
            tokenData[tokens[ind]].baseBuyPrice = baseBuy[ind];
            tokenData[tokens[ind]].baseSellPrice = baseSell[ind];
        }

        setCompactData(buy, sell, blockNumber, indices);
    }

    function setQtyStepFunction(
        ERC20 token,
        int[] xBuy,
        int[] yBuy,
        int[] xSell,
        int[] ySell
    )
        public
        onlyOperator
    {
        require(xBuy.length == yBuy.length);
        require(xSell.length == ySell.length);
        require(tokenData[token].listed);

        tokenData[token].buyPriceQtyStepFunction = StepFunction(xBuy, yBuy);
        tokenData[token].sellPriceQtyStepFunction = StepFunction(xSell, ySell);
    }

    function setImbalanceStepFunction(
        ERC20 token,
        int[] xBuy,
        int[] yBuy,
        int[] xSell,
        int[] ySell
    )
        public
        onlyOperator
    {
        require(xBuy.length == yBuy.length);
        require(xSell.length == ySell.length);
        require(tokenData[token].listed);

        tokenData[token].buyPriceImbalanceStepFunction = StepFunction(xBuy, yBuy);
        tokenData[token].sellPriceImbalanceStepFunction = StepFunction(xSell, ySell);
    }

    function setValidPriceDurationInBlocks(uint duration) public onlyAdmin {
        validPriceDurationInBlocks = duration;
    }

    function enableTokenTrade(ERC20 token) public onlyAdmin {
        require(tokenData[token].listed);
        require(tokenControlInfo[token].minimalRecordResolution != 0);
        tokenData[token].enabled = true;
    }

    function disableTokenTrade(ERC20 token) public onlyAlerter {
        require(tokenData[token].listed);
        tokenData[token].enabled = false;
    }

    function setReserveAddress(address reserve) public onlyAdmin {
        reserveContract = reserve;
    }

    function recordImbalance(
        ERC20 token,
        int buyAmount,
        uint priceUpdateBlock,
        uint currentBlock
    )
        public
    {
        require(msg.sender == reserveContract);

        return addImbalance(token, buyAmount, priceUpdateBlock, currentBlock);
    }

     function getPrice(ERC20 token, uint currentBlockNumber, bool buy, uint qty) public view returns(uint) {
        // check if trade is enabled
        if(!tokenData[token].enabled) return 0;
        if(tokenControlInfo[token].minimalRecordResolution == 0) return 0; // resolution not set

        // get price update block
        TokenPricesCompactData memory compactData = tokenPricesCompactData[tokenData[token].compactDataArrayIndex];

        uint updatePriceBlock = uint(compactData.blockNumber);
        if(currentBlockNumber >= updatePriceBlock + validPriceDurationInBlocks) return 0; // price is expired

        // check imbalance
        int totalImbalance;
        int blockImbalance;
        (totalImbalance, blockImbalance) = getImbalance(token, updatePriceBlock, currentBlockNumber);

        int imbalanceQty = int(qty);
        if(!buy) imbalanceQty *= -1;

        if(abs(totalImbalance + imbalanceQty) >= getMaxTotalImbalance(token)) return 0;
        if(abs(blockImbalance + imbalanceQty) >= getMaxPerBlockImbalance(token)) return 0;

        totalImbalance += imbalanceQty;

        // calculate actual price
        int extraBps;
        int8 priceUpdate;
        uint price;

        if(buy) {
            // start with base price
            price = tokenData[token].baseBuyPrice;

            // add qty overhead
            extraBps = executeStepFunction(tokenData[token].buyPriceQtyStepFunction, int(qty));
            price = addBps(price, extraBps);

            // add imbalance overhead
            extraBps = executeStepFunction(tokenData[token].buyPriceImbalanceStepFunction, totalImbalance);
            price = addBps(price, extraBps);

            // add price update
            priceUpdate = int8(compactData.buy[tokenData[token].compactDataFieldIndex]);
            extraBps = int(priceUpdate) * 10;
            price = addBps(price, extraBps);
        } else {
            // start with base price
            price = tokenData[token].baseSellPrice;

            // add qty overhead
            extraBps = executeStepFunction(tokenData[token].sellPriceQtyStepFunction, int(qty));
            price = addBps(price, extraBps);

            // add imbalance overhead
            extraBps = executeStepFunction(tokenData[token].sellPriceImbalanceStepFunction, totalImbalance);
            price = addBps(price, extraBps);

            // add price update
            priceUpdate = int8(compactData.sell[tokenData[token].compactDataFieldIndex]);
            extraBps = int(priceUpdate) * 10;
            price = addBps(price, extraBps);
        }

        return price;
    }

    function getBasicPrice(ERC20 token, bool buy) public view returns(uint) {
        if(buy) return tokenData[token].baseBuyPrice;
        else return tokenData[token].baseSellPrice;
    }

    function getCompactData(ERC20 token) public view returns(uint, uint, byte, byte) {
        uint arrayIndex = tokenData[token].compactDataArrayIndex;
        uint fieldOffset = tokenData[token].compactDataFieldIndex;

        return (
            arrayIndex,
            fieldOffset,
            tokenPricesCompactData[arrayIndex].buy[fieldOffset],
            tokenPricesCompactData[arrayIndex].sell[fieldOffset]
        );
    }

    function getPriceUpdateBlock(ERC20 token) public view returns(uint) {
        TokenPricesCompactData memory compactData = tokenPricesCompactData[tokenData[token].compactDataArrayIndex];
        return uint(compactData.blockNumber);
    }

    function executeStepFunction(StepFunction f, int x) pure internal returns(int) {
        uint len = f.y.length;
        for(uint ind = 0; ind < len; ind++) {
            if(x <= f.x[ind]) return f.y[ind];
        }

        return f.y[len-1];
    }

    function addBps(uint price, int bps) pure internal returns(uint) {
        uint maxBps = 100 * 100;
        return (price * uint(int(maxBps) + bps)) / maxBps;
    }

    function abs(int x) pure internal returns(uint) {
        if(x < 0) return uint(-1 * x);
        else return uint(x);
    }
}
