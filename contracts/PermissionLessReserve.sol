pragma solidity 0.4.18;


import "./Utils2.sol";
import "./SortedLinkedList.sol";
import "./KyberReserveInterface.sol";
import "./FeeBurner.sol";


contract PermissionLessReserve is SortedLinkedList, KyberReserveInterface {

    uint constant public MIN_ORDER_MAKE_VALUE_WEI = 2 * 10 ** 18;   // 2 Eth
    uint constant public MIN_ORDER_VALUE_WEI = 10 ** 18;            // 1 Eth
    bool public tradeEnabled = false;

    FeeBurner public feeBurnerContract;
    address public kyberNetwork;
    address admin;

    // KNC stakes
    struct KncAmounts {
        uint128 freeKnc; // knc that can be used to validate funds
        uint128 kncOnStake; // per order some knc will move to be kncOnStake. part of it will be used for burning.
    }

    uint public makersBurnFeeBps = 25; // = 25 / 1000 = 0.25 %
    uint constant public BPS = 1000; // basic price steps

    //funds data
    mapping(bytes32=>uint) public remainingFundsPerToken; // deposited maker funds, can't be used till knc deposited.
    mapping(address=>KncAmounts) public makerKncFunds; // knc funds are required for validating deposited funds

    //orders data
    uint32 public lastUsedOrderID;
    mapping(address=>uint32) public sellOrdersHead;//token to Eth order list head
    mapping(address=>uint32) public buyOrdersHead; //Eth to token order list head
    mapping(address=>uint32[]) public makerOrderIDs;

    ERC20 public kncToken = ERC20(address(0xdd974D5C2e2928deA5F71b9825b8b646686BD200));
    uint public kncStakePerEtherBPS = 6000; //for validating orders

    function PermissionLessReserve(address _kyberNetwork, address _admin, ERC20 knc) public {
        require(_kyberNetwork != address(0));
        require(_admin != address(0));
        require(knc != address(0));

        admin = _admin;
        kyberNetwork = _kyberNetwork;
        kncToken = knc;
        tradeEnabled = true;
    }

    function getConversionRate(ERC20 src, ERC20 dest, uint srcQty, uint blockNumber) public view returns(uint) {

        if (tradeEnabled == false) return 0;
        require((src == ETH_TOKEN_ADDRESS) || (dest == ETH_TOKEN_ADDRESS));
        blockNumber; // in this reserve no order expiry == no use for blockNumber. here to avoid compiler warning.

        uint32 orderID;

        if (src == ETH_TOKEN_ADDRESS) {
            if (isEmptyList(buyOrdersHead[dest])) return 0;
            orderID = buyOrdersHead[dest];
        } else {
            if (isEmptyList(sellOrdersHead[src])) return 0;
            orderID = sellOrdersHead[dest];
        }

        uint128 remainingSrcQty = uint128(srcQty);
        uint128 exchangedQty = 0;

        while (!isLastOrder(orderID)) {

            orderID = getNextOrderID(orderID);

            Order memory order = orders[orderID];

            if (order.payAmount < remainingSrcQty) {
                exchangedQty += order.exchangeAmount;
                remainingSrcQty -= order.payAmount;
            } else {
                exchangedQty += order.exchangeAmount * remainingSrcQty / order.payAmount;
                remainingSrcQty = 0;
                break;
            }

        }

        if (remainingSrcQty != 0) return 0; //not enough tokens to exchange.

        return (srcQty * PRECISION / exchangedQty);
    }

    function trade(
        ERC20 srcToken,
        uint srcAmount,
        ERC20 destToken,
        address destAddress,
        uint conversionRate,
        bool validate
    )
        public
        payable
        returns(bool)
    {
        require(tradeEnabled);
        require(msg.sender == address(kyberNetwork));
        require((srcToken == ETH_TOKEN_ADDRESS) || (destToken == ETH_TOKEN_ADDRESS));

        if (validate) {
            require(conversionRate > 0);
        }

        uint32 orderID = sellOrdersHead[srcToken];

        if (srcToken == ETH_TOKEN_ADDRESS) {
            require(msg.value == srcAmount);
            orderID = buyOrdersHead[destToken];
        } else {
            require(srcToken.transferFrom(msg.sender, this, srcAmount));
            require(msg.value == 0);
        }

        uint128 remainingSrcQty = uint128(srcAmount);
        uint128 exchangedQty = 0;

        while (!isLastOrder(orderID)) {

            orderID = getNextOrderID(orderID);

            Order memory order = orders[orderID];

            // since head order is dummy order
            if (order.payAmount < remainingSrcQty) {
                exchangedQty += order.exchangeAmount;
                remainingSrcQty -= order.payAmount;
                require(takeOrder(order.maker, srcToken, destToken, order.payAmount, order.exchangeAmount));
                removeOrder(orderID);
            } else {
                uint128 partialQty = order.exchangeAmount * remainingSrcQty / order.payAmount;
                exchangedQty += partialQty;
                require(takePartialOrder(orderID, srcToken, destToken, remainingSrcQty, partialQty));
                remainingSrcQty = 0;
                break;
            }
        }

        //all orders were successfully taken. send to destAddress
        if (destToken == ETH_TOKEN_ADDRESS) {
            destAddress.transfer(exchangedQty);
        } else {
            require(destToken.transfer(destAddress, exchangedQty));
        }

        return true;
    }

    event MakerDepositedTokens(address indexed maker, ERC20 token, uint amountTwei);

    function makerDepositTokens(address maker, ERC20 token, uint amountTwei) public {
        require(maker != address(0));
        require(token != address(0));

        //notice. if decimal API not supported this should revert
        setDecimals(token);
        require(getDecimals(token) <= MAX_DECIMALS);

        require(token.transferFrom(msg.sender, this, amountTwei));
        remainingFundsPerToken[keccak256(maker, token)] += amountTwei;
        MakerDepositedTokens(maker, token, amountTwei);
    }

    event MakerDepositedEth(address indexed maker, uint amountWei);

    function makerDepositEthers(address maker) public payable {
        require(maker != address(0));

        remainingFundsPerToken[keccak256(maker, ETH_TOKEN_ADDRESS)] += msg.value;
        MakerDepositedEth(maker, msg.value);
    }

    event MakerDepositedKnc(address indexed maker, uint amountTwei);

    function makerDepositKnc(address maker, uint128 amountTwei) public payable {
        require(maker != address(0));

        require(kncToken.transferFrom(msg.sender, this, amountTwei));

        KncAmounts memory amounts = makerKncFunds[maker];

        amounts.freeKnc += uint128(amountTwei);
        makerKncFunds[maker] = amounts;

        MakerDepositedKnc(maker, amountTwei);

        if (makerOrderIDs[maker].length == 0) {
            makerAllocateOrderIDs(maker, 10);
        }
    }

    function makerWithdrawEth(uint weiAmount) public {

        address maker = msg.sender;
        uint makerFreeWeiAmount = remainingFundsPerToken[keccak256(maker, ETH_TOKEN_ADDRESS)];

        if (makerFreeWeiAmount > weiAmount) {
            maker.transfer(weiAmount);
            remainingFundsPerToken[keccak256(maker, ETH_TOKEN_ADDRESS)] -= weiAmount;
        } else {
            maker.transfer(makerFreeWeiAmount);
            remainingFundsPerToken[keccak256(maker, ETH_TOKEN_ADDRESS)] = 0;
        }
    }

    function makerWithdrawTokens(ERC20 token, uint tweiAmount) public {
        address maker = msg.sender;
        uint makerFreeTweiAmount = remainingFundsPerToken[keccak256(maker, token)];

        if (makerFreeTweiAmount > tweiAmount) {
            token.transfer(maker, tweiAmount);
            remainingFundsPerToken[keccak256(maker, token)] -= tweiAmount;
        } else {
            token.transfer(maker, makerFreeTweiAmount);
            remainingFundsPerToken[keccak256(maker, token)] = 0;
        }
    }

    function makeOrder(address maker, bool isEthToToken, ERC20 token, uint128 payAmount, uint128 exchangeAmount,
        uint32 hintPrevOrder) public returns(bool)
    {
        require(maker == msg.sender);
        require(validateOrder(maker, isEthToToken, token, payAmount, exchangeAmount));
        require(initOrderList(token, isEthToToken));

        uint32 orderID = takeOrderID(maker);

        orders[orderID] = Order(maker, 0, 0, ACTIVE, payAmount, exchangeAmount);

        if (isEthToToken) {
            insertMakeOrder(orderID, hintPrevOrder, buyOrdersHead[token]);
        } else {
            insertMakeOrder(orderID, hintPrevOrder, sellOrdersHead[token]);
        }

        return true;
    }

    function insertMakeOrder (uint32 newOrderID, uint32 hintPrevOrder, uint32 head) internal {

        if (hintPrevOrder != 0) {
            require(verifyOrderPosition(hintPrevOrder, newOrderID));
            insertOrder(newOrderID, hintPrevOrder);
        }

        uint32 currentOrder = head;

        while (!isLastOrder(currentOrder)) {

            if (isOrderBetterRate(currentOrder, newOrderID)) break;

            currentOrder = orders[currentOrder].nextOrderID;
        }

        insertOrder(currentOrder, newOrderID);
    }

    function cancelOrder(address maker, bool isEthToToken, ERC20 token, uint32 orderID) public returns(bool)
    {
        require(maker == msg.sender);

        Order storage myOrder = orders[orderID];
        require(maker == myOrder.maker);

        token;
        uint weiAmount;

        if (isEthToToken) {
            weiAmount = myOrder.payAmount;
        } else {
            weiAmount = myOrder.exchangeAmount;
        }

        require(releaseOrderStakes(maker, calcKncStake(weiAmount), 0));

        removeOrder(orderID);
        releaseOrderID(orderID);

        return true;
    }

    function setFeeBurner(FeeBurner burner) public {
        require(burner != address(0));

        kncToken.approve(feeBurnerContract, 0);

        feeBurnerContract = burner;

        kncToken.approve(feeBurnerContract, (2**255));
    }

    function isOrderBetterRate(uint32 orderID, uint32 checkedOrderID) public view returns(bool) {

        Order storage order = orders[orderID];
        Order storage checkedOrder = orders[checkedOrderID];

        uint orderRate = order.exchangeAmount * PRECISION / order.payAmount;
        uint checkedRate = checkedOrder.exchangeAmount * PRECISION / checkedOrder.payAmount;

        // especially for our CTO
        checkedRate > orderRate ? true : false;
    }

    function bindOrderFunds(address maker, bool isEthToToken, ERC20 token, uint128 exchangeAmount)
        internal
        returns(bool)
    {

        if (isEthToToken) {
            require(remainingFundsPerToken[keccak256(maker, ETH_TOKEN_ADDRESS)] >= exchangeAmount);
            remainingFundsPerToken[keccak256(maker, ETH_TOKEN_ADDRESS)] -= exchangeAmount;
        } else {
            require(remainingFundsPerToken[keccak256(maker, token)] >= exchangeAmount);
            remainingFundsPerToken[keccak256(maker, token)] -= exchangeAmount;
        }

        return true;
    }

    function calcKncStake(uint weiAmount) public view returns(uint) {
        return(weiAmount * kncStakePerEtherBPS / BPS);
    }

    function calcBurnAmount(uint weiAmount) public view returns(uint) {
        return(weiAmount * makersBurnFeeBps * feeBurnerContract.kncPerETHRate() / BPS);
    }

    function initOrderList(ERC20 token, bool isEthToToken) public returns(bool) {

        uint32 orderID;

        if (isEthToToken) {
            if (buyOrdersHead[token] != 0) return true;
            orderID = buyOrdersHead[token] = ++lastUsedOrderID;
        } else {
            if (sellOrdersHead[token] != 0) return true;
            orderID = sellOrdersHead[token] = ++lastUsedOrderID;
        }

        // init head order with highest rate. so its never replaced
        orders[orderID] = Order(address(orderID), orderID, 0, HEAD, 1, (2 ** 127));

        return true;
    }

    event KyberNetworkSet(address kyberContract);
    function setKyberNetwork (address kyber) public {

        require(msg.sender == admin);
        kyberNetwork = kyber;
        
        KyberNetworkSet(kyberNetwork);
    }

    event TradeEnabled(bool enable);

    function enableTrade() public returns(bool) {
        require(msg.sender == admin);
        tradeEnabled = true;
        TradeEnabled(true);

        return true;
    }

    function disableTrade() public returns(bool) {
        require(msg.sender == admin);
        tradeEnabled = false;
        TradeEnabled(false);

        return true;
    }

    function releaseOrderFunds(bool isEthToToken, ERC20 token, Order order) internal returns(bool) {

        if (isEthToToken) {
            remainingFundsPerToken[keccak256(order.maker, ETH_TOKEN_ADDRESS)] += order.exchangeAmount;
        } else {
            remainingFundsPerToken[keccak256(order.maker, token)] += order.exchangeAmount;
        }

        return true;
    }

    function bindOrderStakes(address maker, uint stakeAmountTwei) internal returns(bool) {

        KncAmounts memory amounts = makerKncFunds[maker];

        require(amounts.freeKnc > stakeAmountTwei);
        amounts.freeKnc -= uint128(stakeAmountTwei);
        amounts.kncOnStake += uint128(stakeAmountTwei);

        makerKncFunds[maker] = amounts;

        return true;
    }

    //@dev if burnAmount is 0 we only release stakes.
    function releaseOrderStakes(address maker, uint totalStakeTwei, uint burnAmountTwei) internal returns(bool) {
        require(totalStakeTwei > burnAmountTwei);

        KncAmounts memory amounts = makerKncFunds[maker];

        amounts.freeKnc += uint128(totalStakeTwei - burnAmountTwei);
        require(amounts.kncOnStake > uint128(totalStakeTwei));
        amounts.kncOnStake -= uint128(totalStakeTwei);

        makerKncFunds[maker] = amounts;

        return true;
    }

    function getMakerFreeFunds(address maker, ERC20 token) public view returns (uint) {
        return (remainingFundsPerToken[keccak256(maker, token)]);
    }

    function getMakerFreeKNC(address maker) public view returns (uint) {
        return (uint(makerKncFunds[maker].freeKnc));
    }

    function getMakerStakedKNC(address maker) public view returns (uint) {
        return (uint(makerKncFunds[maker].kncOnStake));
    }

    ///@dev funds are valid only when required knc amount can be staked for this order.
    function validateOrder(address maker, bool isEthToToken, ERC20 token, uint128 payAmount, uint128 exchangeAmount)
        internal returns(bool)
    {
        require(bindOrderFunds(maker, isEthToToken, token, exchangeAmount));

        uint weiAmount;
        if (isEthToToken) {
            weiAmount = payAmount;
        } else {
            weiAmount = exchangeAmount;
        }

        require(weiAmount >= MIN_ORDER_MAKE_VALUE_WEI);
        require(bindOrderStakes(maker, calcKncStake(weiAmount)));

        return true;
    }

    function takePartialOrder(
        uint32 orderID,
        ERC20 src,
        ERC20 dest,
        uint128 payAmount,
        uint128 exchangeAmount
    )
        internal
        returns(bool)
    {

        Order memory order = orders[orderID];
        require(payAmount < order.payAmount);
        require(exchangeAmount < order.exchangeAmount);

        order.payAmount -= payAmount;
        order.exchangeAmount -= exchangeAmount;

        uint remainingWeiValue;
        if (src == ETH_TOKEN_ADDRESS) {
            remainingWeiValue = order.payAmount;
        } else {
            remainingWeiValue = order.exchangeAmount;
        }

        if (remainingWeiValue < MIN_ORDER_VALUE_WEI) {
            // remaining order amount too small. remove order and set remaining funds as free funds
            remainingFundsPerToken[keccak256(order.maker, dest)] += order.exchangeAmount;
            releaseOrderStakes(order.maker, remainingWeiValue, 0);
            removeOrder(orderID);
        } else {
            // update order values in storage
            orders[orderID] = order;
        }

        return(takeOrder(order.maker, src, dest, payAmount, exchangeAmount));
    }

    function takeOrder(
        address maker,
        ERC20 src,
        ERC20 dest,
        uint payAmount,
        uint exchangeAmount
    )
        internal
        returns(bool)
    {
        uint weiAmount;

        //tokens already collected. just update maker balance
        remainingFundsPerToken[keccak256(maker, dest)] += payAmount;

        // send dest tokens in one batch. not here

        //handle knc stakes and fee
        if (src == ETH_TOKEN_ADDRESS) {
            weiAmount = payAmount;
        } else {
            weiAmount = exchangeAmount;
        }

        releaseOrderStakes(maker, calcKncStake(weiAmount), calcBurnAmount(weiAmount));

        return true;
    }

    function takeOrderID(address maker) internal returns(uint32) {

        for (uint i = 0; i < makerOrderIDs[maker].length; i++) {
            uint32 nextOrderID = makerOrderIDs[maker][i];
            if (orders[nextOrderID].orderState == FREE) return nextOrderID;
        }

        return makerAllocateOrderIDs(maker, 1);
    }

    function releaseOrderID(uint32 orderID) internal returns(bool) {
        orders[orderID].orderState = FREE;
    }

    function makerAllocateOrderIDs(address maker, uint numOrders) internal returns(uint32 lastInsertedOrder) {

        for (uint i = 0; i < numOrders; i++) {
            makerOrderIDs[maker].push(++lastUsedOrderID);
        }

        return lastUsedOrderID;
    }
}
