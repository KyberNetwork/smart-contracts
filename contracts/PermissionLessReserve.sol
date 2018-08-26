pragma solidity 0.4.18;


import "./Orders.sol";
import "./KyberReserveInterface.sol";
import "./FeeBurner.sol";


contract PermissionLessReserve is Orders, KyberReserveInterface {

    uint public minOrderValueWei = 10 ** 18;                 // below this value order will be removed.
    uint public minOrderMakeWeiValue = 2 * minOrderValueWei; // Below this value can't create new order.
    uint public makersBurnFeeBps = 25;              // knc burn fee per order that is taken. = 25 / 1000 = 0.25 %

    ERC20 public reserveToken; // this reserve will serve buy / sell for this token.
    FeeBurner public feeBurnerContract;
    address public admin;

    ERC20 public kncToken;  //can't be constant. to enable testing and test net usage
    uint public kncStakePerEtherBPS = 20000; //for validating orders
    uint32 public numOrdersToAllocate = 60;

    // KNC stakes
    struct KncStakes {
        uint128 freeKnc;    // knc that can be used to validate funds
        uint128 kncOnStake; // per order some knc will move to be kncOnStake. part of it will be used for burning.
    }
    
    //funds data
    mapping(address => mapping(address => uint)) public makerFunds; // deposited maker funds,
            // where order added funds are subtracted here and added to order
    mapping(address => KncStakes) public makerKncStakes; // knc funds are required for validating deposited funds

    //maker orders
    struct FreeOrders {
        uint32 firstOrderId;
        uint32 numOrders; //max is 256
        uint8 maxOrdersReached;
        uint256 takenBitmap;
    }

    mapping(address => FreeOrders) makerOrders; //each maker will have orders that will be reused.

    function PermissionLessReserve(FeeBurner burner, ERC20 knc, ERC20 token, address _admin) public {

        require(knc != address(0));
        require(token != address(0));
        require(_admin != address(0));
        require(burner != address(0));

        feeBurnerContract = burner;
        kncToken = knc;
        reserveToken = token;
        admin = _admin;

        kncToken.approve(feeBurnerContract, (2**255));

        //notice. if decimal API not supported this should revert
        setDecimals(reserveToken);
        require(getDecimals(reserveToken) <= MAX_DECIMALS);
    }

    function getConversionRate(ERC20 src, ERC20 dest, uint totalSrcAmount, uint blockNumber) public view returns(uint) {

        require((src == ETH_TOKEN_ADDRESS) || (dest == ETH_TOKEN_ADDRESS));
        require((src == reserveToken) || (dest == reserveToken));
        blockNumber; // in this reserve no order expiry == no use for blockNumber. here to avoid compiler warning.

        uint32 orderId;

        if (src == ETH_TOKEN_ADDRESS) {
            if (isNextOrderTail(BUY_HEAD_ID)) return 0;
            orderId = BUY_HEAD_ID;
        } else {
            if (isNextOrderTail(SELL_HEAD_ID)) return 0;
            orderId = SELL_HEAD_ID;
        }

        uint128 remainingSrcAmount = uint128(totalSrcAmount);
        uint128 totalDstAmount = 0;

        while (!isNextOrderTail(orderId)) {

            orderId = getNextOrderId(orderId);

            Order memory order = orders[orderId];

            if (order.srcAmount < remainingSrcAmount) {
                totalDstAmount += order.dstAmount;
                remainingSrcAmount -= order.srcAmount;
            } else {
                totalDstAmount += order.dstAmount * remainingSrcAmount / order.srcAmount;
                remainingSrcAmount = 0;
                break;
            }
        }

        if ((remainingSrcAmount != 0) || (totalDstAmount == 0)) return 0; //not enough tokens to exchange.

        //check overflow
        if (uint(totalDstAmount) * PRECISION < uint(totalDstAmount)) return 0;

        return calcRateFromQty(totalSrcAmount, totalDstAmount, getDecimals(src), getDecimals(dest));
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
        require((srcToken == ETH_TOKEN_ADDRESS) || (destToken == ETH_TOKEN_ADDRESS));
        require((srcToken == reserveToken) || (destToken == reserveToken));

        if (validate) {
            require(conversionRate > 0);
        }

        uint32 orderId;

        if (srcToken == ETH_TOKEN_ADDRESS) {
            require(msg.value == srcAmount);
            orderId = BUY_HEAD_ID;
        } else {
            require(srcToken.transferFrom(msg.sender, this, srcAmount));
            require(msg.value == 0);
            orderId = SELL_HEAD_ID;
        }

        uint128 remainingSrcAmount = uint128(srcAmount);
        uint128 totalDstAmount = 0;

        while (!isNextOrderTail(orderId)) {

            // start with next since head order is dummy order
            orderId = getNextOrderId(orderId);

            Order memory order = orders[orderId];

            if (order.srcAmount <= remainingSrcAmount) {
                totalDstAmount += order.dstAmount;
                remainingSrcAmount -= order.srcAmount;
                require(takeFullOrder(orderId, srcToken, destToken, order));
                if (remainingSrcAmount == 0) break;
            } else {
                uint128 partialDstQty = order.dstAmount * remainingSrcAmount / order.srcAmount;
                totalDstAmount += partialDstQty;
                require(takePartialOrder(orderId, srcToken, destToken, remainingSrcAmount, partialDstQty));
                remainingSrcAmount = 0;
                break;
            }
        }

        //all orders were successfully taken. send to destAddress
        if (destToken == ETH_TOKEN_ADDRESS) {
            destAddress.transfer(totalDstAmount);
        } else {
            require(destToken.transfer(destAddress, totalDstAmount));
        }

        return true;
    }

    event NewMakeOrder(uint32 orderId, address indexed maker, bool isEthToToken, uint128 srcAmount, uint128 dstAmount);

    function addMakeOrder(address maker, bool isEthToToken, uint128 srcAmount, uint128 dstAmount,
        uint32 hintPrevOrder) public returns(bool)
    {
        require(maker == msg.sender);
        require(validateOrder(maker, isEthToToken, srcAmount, dstAmount));

        uint32 newID = takeOrderId(maker);

        if (hintPrevOrder != 0) {

            addAfterId(maker, newID, srcAmount, dstAmount, hintPrevOrder, isEthToToken? ETH_TO_TOKEN : TOKEN_TO_ETH);
        } else {

            if (isEthToToken) {
                add(maker, newID, srcAmount, dstAmount, BUY_HEAD_ID, ETH_TO_TOKEN);
            } else {
                add(maker, newID, srcAmount, dstAmount, SELL_HEAD_ID, TOKEN_TO_ETH);
            }
        }

        NewMakeOrder(newID, maker, isEthToToken, srcAmount, dstAmount);

        return true;
    }

    event MakerDepositedTokens(address indexed maker, uint amountTwei);

    function makerDepositTokens(address maker, uint amountTwei) public {
        require(maker != address(0));

        require(reserveToken.transferFrom(msg.sender, this, amountTwei));

        makerFunds[maker][reserveToken] += amountTwei;
        MakerDepositedTokens(maker, amountTwei);
    }

    event MakerDepositedEth(address indexed maker, uint amountWei);

    function makerDepositEthers(address maker) public payable {
        require(maker != address(0));

        makerFunds[maker][ETH_TOKEN_ADDRESS] += msg.value;
        MakerDepositedEth(maker, msg.value);
    }

    event MakerDepositedKnc(address indexed maker, uint amountTwei);

    function makerDepositKnc(address maker, uint128 amountTwei) public payable {

        require(maker != address(0));

        require(kncToken.transferFrom(msg.sender, this, amountTwei));

        KncStakes memory amounts = makerKncStakes[maker];

        amounts.freeKnc += uint128(amountTwei);
        makerKncStakes[maker] = amounts;

        MakerDepositedKnc(maker, amountTwei);

        if (makerOrders[maker].numOrders == 0) {
            allocateOrders(maker, numOrdersToAllocate);
        }
    }

    function makerWithdrawEth(uint weiAmount) public {

        address maker = msg.sender;
        uint makerFreeWeiAmount = makerFunds[maker][ETH_TOKEN_ADDRESS];

        if (makerFreeWeiAmount > weiAmount) {
            maker.transfer(weiAmount);
            makerFunds[maker][ETH_TOKEN_ADDRESS] -= weiAmount;
        } else {
            maker.transfer(makerFreeWeiAmount);
            makerFunds[maker][ETH_TOKEN_ADDRESS] = 0;
        }
    }

    function makerWithdrawTokens(uint tweiAmount) public {

        address maker = msg.sender;
        uint makerFreeTweiAmount = makerFunds[maker][reserveToken];

        if (makerFreeTweiAmount > tweiAmount) {
            reserveToken.transfer(maker, tweiAmount);
            makerFunds[maker][reserveToken] -= tweiAmount;
        } else {
            reserveToken.transfer(maker, makerFreeTweiAmount);
            makerFunds[maker][reserveToken] = 0;
        }
    }

    event OrderCanceled(address indexed maker, uint32 orderId, uint srcAmount, uint dstAmount);
    function cancelOrder(uint32 orderId) public returns(bool) {

        address maker = msg.sender;
        Order memory myOrder = orders[orderId];

        require(maker == myOrder.maker);

        uint weiAmount;

        if (myOrder.data == ETH_TO_TOKEN) {
            weiAmount = myOrder.srcAmount;
        } else {
            weiAmount = myOrder.dstAmount;
        }

        require(handleOrderStakes(maker, calcKncStake(weiAmount), 0));

        // @dev: below can be done in two functions. no gas waste since handles different storage values.
        removeById(orderId);
        releaseOrderId(myOrder.maker, orderId);

        OrderCanceled(maker, orderId, myOrder.srcAmount, myOrder.dstAmount);

        return true;
    }

    function setFeeBurner(FeeBurner burner) public {
        require(burner != address(0));

        kncToken.approve(feeBurnerContract, 0);

        feeBurnerContract = burner;

        kncToken.approve(feeBurnerContract, (2**255));
    }

    function getBuyOrderList() public view returns(uint32[] orderList) {

        uint32 orderId;

        uint counter = 1;

        orderId = BUY_HEAD_ID;

        while (!isNextOrderTail(orderId)) {
            orderId = getNextOrderId(orderId);
            counter++;
        }

        orderList = new uint32[](counter);

        orderId = BUY_HEAD_ID;

        counter = 0;
        orderList[counter++] = orderId;

        while (!isNextOrderTail(orderId)) {
            orderId = getNextOrderId(orderId);
            orderList[counter++] = orderId;
        }
    }

    function getSellOrderList() public view returns(uint32[] orderList) {

        uint32 orderId;
        uint counter = 1;

        orderId = SELL_HEAD_ID;

        while (!isNextOrderTail(orderId)) {
            orderId = getNextOrderId(orderId);
            counter++;
        }

        orderList = new uint32[](counter);

        orderId = SELL_HEAD_ID;

        counter = 0;
        orderList[counter++] = orderId;

        while (!isNextOrderTail(orderId)) {
            orderId = getNextOrderId(orderId);
            orderList[counter++] = orderId;
        }
    }

    function bindOrderFunds(address maker, bool isEthToToken, uint128 dstAmount)
        internal
        returns(bool)
    {

        if (isEthToToken) {
            require(makerFunds[maker][reserveToken] >= dstAmount);
            makerFunds[maker][reserveToken] -= dstAmount;
        } else {
            require(makerFunds[maker][ETH_TOKEN_ADDRESS] >= dstAmount);
            makerFunds[maker][ETH_TOKEN_ADDRESS] -= dstAmount;
        }

        return true;
    }

    function calcKncStake(uint weiAmount) public view returns(uint) {
        return(weiAmount * kncStakePerEtherBPS / 1000);
    }

    function calcBurnAmount(uint weiAmount) public view returns(uint) {
        return(weiAmount * makersBurnFeeBps * feeBurnerContract.kncPerETHRate() / 1000);
    }

    function releaseOrderFunds(bool isEthToToken, Order order) internal returns(bool) {

        if (isEthToToken) {
            makerFunds[order.maker][ETH_TOKEN_ADDRESS] += order.dstAmount;
        } else {
            makerFunds[order.maker][reserveToken] += order.dstAmount;
        }

        return true;
    }

    function bindOrderStakes(address maker, uint stakeAmountTwei) internal returns(bool) {

        KncStakes storage amounts = makerKncStakes[maker];

        require(amounts.freeKnc > stakeAmountTwei);
        amounts.freeKnc -= uint128(stakeAmountTwei);
        amounts.kncOnStake += uint128(stakeAmountTwei);

        return true;
    }

    //@dev if burnAmount is 0 we only release stakes.
    function handleOrderStakes(address maker, uint releaseAmountTwei, uint burnAmountTwei) internal returns(bool) {
        require(releaseAmountTwei > burnAmountTwei);

        KncStakes storage amounts = makerKncStakes[maker];

        require(amounts.kncOnStake >= uint128(releaseAmountTwei));

        amounts.kncOnStake -= uint128(releaseAmountTwei);
        amounts.freeKnc += uint128(releaseAmountTwei - burnAmountTwei);

        return true;
    }

    function makerAllocateOrders(address maker) public {

        //if initial allocation was already made. and all orders are free. maker can re allocate
        require(makerOrders[maker].numOrders > 0);
        require(makerOrders[maker].takenBitmap == 0);
        require(makerOrders[maker].maxOrdersReached == 1);

        makerOrders[maker].maxOrdersReached = 0;

        uint32 howMany = makerOrders[maker].numOrders * 2;
        if (howMany > 256) howMany = 256;

        allocateOrders(maker, howMany);
    }

    function getMakerFreeTokenTwei(address maker) public view returns (uint) {
        return (makerFunds[maker][reserveToken]);
    }

    function getMakerFreeWei(address maker) public view returns (uint) {
        return (makerFunds[maker][ETH_TOKEN_ADDRESS]);
    }

    function getMakerFreeKNC(address maker) public view returns (uint) {
        return (uint(makerKncStakes[maker].freeKnc));
    }

    function getMakerStakedKNC(address maker) public view returns (uint) {
        return (uint(makerKncStakes[maker].kncOnStake));
    }

    ///@dev funds are valid only when required knc amount can be staked for this order.
    function validateOrder(address maker, bool isEthToToken, uint128 srcAmount, uint128 dstAmount)
        internal returns(bool)
    {
        require(bindOrderFunds(maker, isEthToToken, dstAmount));

        uint weiAmount;
        if (isEthToToken) {
            weiAmount = srcAmount;
        } else {
            weiAmount = dstAmount;
        }

        require(weiAmount >= minOrderMakeWeiValue);
        require(bindOrderStakes(maker, calcKncStake(weiAmount)));

        return true;
    }

    function takeFullOrder(
        uint32 orderId,
        ERC20 src,
        ERC20 dest,
        Order order
    )
        internal
        returns (bool)
    {
        removeById(orderId);
        return takeOrder(order.maker, src, dest, order.srcAmount, order.dstAmount);
    }

    function takePartialOrder(
        uint32 orderId,
        ERC20 src,
        ERC20 dest,
        uint128 srcAmount,
        uint128 dstAmount
    )
        internal
        returns(bool)
    {

        Order memory order = orders[orderId];
        require(srcAmount < order.srcAmount);
        require(dstAmount < order.dstAmount);

        order.srcAmount -= srcAmount;
        order.dstAmount -= dstAmount;

        uint remainingWeiValue;
        if (src == ETH_TOKEN_ADDRESS) {
            remainingWeiValue = order.srcAmount;
        } else {
            remainingWeiValue = order.dstAmount;
        }

        if (remainingWeiValue < minOrderValueWei) {
            // remaining order amount too small. remove order and add remaining funds to free funds
            makerFunds[order.maker][dest] += order.dstAmount;
            handleOrderStakes(order.maker, remainingWeiValue, 0);
            removeById(orderId);
        } else {
            // update order values in storage
            orders[orderId].srcAmount = order.srcAmount;
            orders[orderId].dstAmount = order.dstAmount;
        }

        return(takeOrder(order.maker, src, dest, srcAmount, dstAmount));
    }

    function takeOrder(
        address maker,
        ERC20 src,
        ERC20 dest,
        uint srcAmount,
        uint dstAmount
    )
        internal
        returns(bool)
    {
        uint weiAmount;

        //tokens already collected. just update maker balance
        makerFunds[maker][src] += srcAmount;

        // send dest tokens in one batch. not here
        dest;

        //handle knc stakes and fee
        if (src == ETH_TOKEN_ADDRESS) {
            weiAmount = srcAmount;
        } else {
            weiAmount = dstAmount;
        }

        handleOrderStakes(maker, calcKncStake(weiAmount), calcBurnAmount(weiAmount));

        return true;
    }

    function takeOrderId(address maker) internal returns(uint32) {

        uint numOrders = makerOrders[maker].numOrders;
        uint orderBitmap = makerOrders[maker].takenBitmap;
        uint bitPointer = 1;

        for(uint i = 0; i < numOrders; ++i) {

            if ((orderBitmap & bitPointer) == 0) {
                makerOrders[maker].takenBitmap = orderBitmap | bitPointer;
                return(uint32(uint(makerOrders[maker].firstOrderId) + i));
            }

            bitPointer *= 2;
        }

        makerOrders[maker].maxOrdersReached = 1;

        require(false);
    }

    /// @dev mark order as free to use.
    function releaseOrderId(address maker, uint32 orderId) internal returns(bool) {
        
        require(orderId >= makerOrders[maker].firstOrderId);
        require(orderId < (makerOrders[maker].firstOrderId + makerOrders[maker].numOrders));

        uint orderBitNum = uint(orderId) - uint(makerOrders[maker].firstOrderId);
        uint256 bitPointer = 1 * (2 ** orderBitNum);
//        require(bitPointer & makerOrders[orderId].takenBitmap == 1);
        uint256 bitNegation = bitPointer ^ 0xffffffffffffffff;

        makerOrders[maker].takenBitmap &= bitNegation;
    }

    function allocateOrders(address maker, uint32 howMany) internal {

        require(howMany <= 256);

        // make sure no orders in use at the moment
        require(makerOrders[maker].takenBitmap == 0);

        uint32 firstOrder = allocateIds(howMany);

        makerOrders[maker] = FreeOrders({
                firstOrderId: firstOrder,
                numOrders: uint32(howMany),
                maxOrdersReached: 0,
                takenBitmap: 0
            });
    }
}
