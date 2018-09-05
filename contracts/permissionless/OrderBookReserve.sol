pragma solidity 0.4.18;


import "./OrdersInterface.sol";
import "./MakerOrders.sol";
import "./FeeBurnerResolverInterface.sol";
import "./OrdersFactoryInterface.sol";
import "./OrderBookReserveInterface.sol";
import "../Utils2.sol";
import "../KyberReserveInterface.sol";


contract FeeBurnerSimpleIf {
    uint public kncPerETHRate;
}


contract OrderBookReserve is MakerOrders, Utils2, KyberReserveInterface, OrderBookReserveInterface {

    uint public minOrderValueWei = 10 ** 18;                 // below this value order will be removed.
    uint public minOrderMakeValueWei = 2 * minOrderValueWei; // Below this value can't create new order.
    uint public makersBurnFeeBps = 25;              // knc burn fee per order that is taken. = 25 / 1000 = 0.25 %

    ERC20 public token; // this reserve will serve buy / sell for this token.
    FeeBurnerSimpleIf public feeBurnerContract;
    FeeBurnerResolverInterface public feeBurnerResolverContract;
    OrdersFactoryInterface ordersFactoryContract;

    ERC20 public kncToken;  //not constant. to enable testing and test net usage
    int public kncStakePerEtherBps = 20000; //for validating orders
    uint32 public numOrdersToAllocate = 60;

    OrdersInterface public sellList;
    OrdersInterface public buyList;

    uint32 orderListTailId;

    // KNC stakes
    struct KncStakes {
        uint128 freeKnc;    // knc that can be used to validate funds
        uint128 kncOnStake; // per order some knc will move to be kncOnStake. part of it will be used for burning.
    }

    //funds data
    mapping(address => mapping(address => uint)) public makerFunds; // deposited maker funds,
    mapping(address => KncStakes) public makerKncStakes; // knc funds are required for validating deposited funds

    //each maker will have orders that will be reused.
    mapping(address => FreeOrders) public makerOrdersSell;
    mapping(address => FreeOrders) public makerOrdersBuy;

    struct OrderData {
        address maker;
        uint32 nextId;
        bool isLastOrder;
        uint128 srcAmount;
        uint128 dstAmount;
    }

    function OrderBookReserve(
        ERC20 knc,
        ERC20 _token,
        FeeBurnerResolverInterface resolver,
        OrdersFactoryInterface factory
    )
        public
    {

        require(knc != address(0));
        require(_token != address(0));
        require(resolver != address(0));
        require(factory != address(0));

        feeBurnerResolverContract = resolver;
        feeBurnerContract = FeeBurnerSimpleIf(feeBurnerResolverContract.getFeeBurnerAddress());
        kncToken = knc;
        token = _token;
        ordersFactoryContract = factory;

        require(kncToken.approve(feeBurnerContract, (2**255)));

//        notice. if decimal API not supported this should revert
        setDecimals(token);
        require(getDecimals(token) > 0);
    }

    function init() public {
        require(sellList == address(0));
        require(buyList == address(0));

        sellList = ordersFactoryContract.newOrdersContract(this);
        buyList = ordersFactoryContract.newOrdersContract(this);
    }

    function getConversionRate(ERC20 src, ERC20 dest, uint srcQty, uint blockNumber) public view returns(uint) {

        require((src == ETH_TOKEN_ADDRESS) || (dest == ETH_TOKEN_ADDRESS));
        require((src == token) || (dest == token));
        blockNumber; // in this reserve no order expiry == no use for blockNumber. here to avoid compiler warning.

        OrdersInterface list;

        if (src == ETH_TOKEN_ADDRESS) {
            list = buyList;
        } else {
            list = sellList;
        }

        uint32 orderId;
        OrderData memory orderData;

        (orderId, orderData.isLastOrder) = list.getFirstOrder();

        if (orderData.isLastOrder) return 0;

        uint128 remainingSrcAmount = uint128(srcQty);
        uint128 totalDstAmount = 0;

        orderData.isLastOrder = false;

        while (!orderData.isLastOrder) {

            (orderData.maker, orderData.nextId, orderData.isLastOrder, orderData.srcAmount, orderData.dstAmount) =
                getOrderData(list, orderId);

            if (orderData.srcAmount <= remainingSrcAmount) {
                totalDstAmount += orderData.dstAmount;
                remainingSrcAmount -= orderData.srcAmount;
            } else {
                totalDstAmount += orderData.dstAmount * remainingSrcAmount / orderData.srcAmount;
                remainingSrcAmount = 0;
                break;
            }

            orderId = orderData.nextId;
        }

        if ((remainingSrcAmount != 0) || (totalDstAmount == 0)) return 0; //not enough tokens to exchange.

        return calcRateFromQty(srcQty, totalDstAmount, getDecimals(src), getDecimals(dest));
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
        require((srcToken == token) || (destToken == token));

        conversionRate;
        validate;

        OrdersInterface list;

        if (srcToken == ETH_TOKEN_ADDRESS) {
            require(msg.value == srcAmount);
            list = buyList;
        } else {
            require(msg.value == 0);
            require(srcToken.transferFrom(msg.sender, this, srcAmount));
            list = sellList;
        }

        uint32 orderId;
        OrderData memory orderData;

        (orderId, orderData.isLastOrder) = list.getFirstOrder();

        if (orderData.isLastOrder) require(false);

        uint128 remainingSrcAmount = uint128(srcAmount);
        uint128 totalDstAmount = 0;

        orderData.isLastOrder = false;

        while (!orderData.isLastOrder) {

            (orderData.maker, orderData.nextId, orderData.isLastOrder, orderData.srcAmount, orderData.dstAmount) =
                getOrderData(list, orderId);

            if (orderData.srcAmount <= remainingSrcAmount) {
                totalDstAmount += orderData.dstAmount;
                remainingSrcAmount -= orderData.srcAmount;
                require(takeFullOrder(orderId, srcToken, destToken, orderData.maker, orderData.srcAmount, orderData.dstAmount));
                if (remainingSrcAmount == 0) break;

            } else {
                uint128 partialDstQty = orderData.dstAmount * remainingSrcAmount / orderData.srcAmount;
                totalDstAmount += partialDstQty;
                require(takePartialOrder(orderId, orderData.maker, srcToken, destToken, remainingSrcAmount, partialDstQty,
                    orderData.srcAmount, orderData.dstAmount));
                remainingSrcAmount = 0;
                break;
            }

            orderId = orderData.nextId;
        }

        //all orders were successfully taken. send to destAddress
        if (destToken == ETH_TOKEN_ADDRESS) {
            destAddress.transfer(totalDstAmount);
        } else {
            require(destToken.transfer(destAddress, totalDstAmount));
        }

        return true;
    }

    event NewMakeOrder(
        address indexed maker,
        uint32 orderId,
        bool isEthToToken,
        uint128 srcAmount,
        uint128 dstAmount,
        bool addedWithHint
    );

    function makeOrder(address maker, bool isEthToToken, uint128 srcAmount, uint128 dstAmount, uint32 hintPrevOrder)
        public
        returns(bool)
    {
        require(maker == msg.sender);

        OrdersInterface list;
        uint32 newId;

        if (isEthToToken) {
            list = buyList;
            newId = takeOrderId(makerOrdersBuy[maker]);
        } else {
            list = sellList;
            newId = takeOrderId(makerOrdersSell[maker]);
        }

        addOrder(maker, isEthToToken, list, newId, srcAmount, dstAmount, hintPrevOrder);
    }

    function makeOrderBatch(address maker, bool isEthToToken, uint128[] srcAmount, uint128[] dstAmount,
        uint32[] hintPrevOrder, bool[] isAfterMyPrevOrder) public
    {
        require(dstAmount.length == hintPrevOrder.length);
        require(srcAmount.length == dstAmount.length);
        require(maker == msg.sender);

        OrdersInterface list;

        if (isEthToToken) {
            list = buyList;
        } else {
            list = sellList;
        }

        uint32 newId;
        uint32 prevId;

        for (uint i = 0; i < srcAmount.length; ++i) {

            if (isAfterMyPrevOrder[i]) {
                prevId = newId;
            } else {
                prevId = hintPrevOrder[i];
            }

            if (isEthToToken) {
                newId = takeOrderId(makerOrdersBuy[maker]);
            } else {
                newId = takeOrderId(makerOrdersSell[maker]);
            }

            require(addOrder(maker, isEthToToken, list, newId, srcAmount[i], dstAmount[i], prevId));
        }
    }

    function addOrder(address maker, bool isEthToToken, OrdersInterface list, uint32 newId, uint128 srcAmount,
        uint128 dstAmount, uint32 hintPrevOrder)
        internal
        returns(bool)
    {
        require(validateOrder(maker, isEthToToken, srcAmount, dstAmount));

        bool addedWithHint = false;

        if (hintPrevOrder != 0) {

            addedWithHint = list.addAfterId(maker, newId, srcAmount, dstAmount, hintPrevOrder);
        }

        if (addedWithHint == false) {

            list.add(maker, newId, srcAmount, dstAmount);
        }

        NewMakeOrder(maker, newId, isEthToToken, srcAmount, dstAmount, addedWithHint);

        return true;
    }

    event makeOrderUpdated(
        address indexed maker,
        bool isEthToToken,
        uint orderId,
        uint128 srcAmount,
        uint128 dstAmount,
        bool updatedWithHint
    );

    function updateMakeOrder(address maker, bool isEthToToken, uint32 orderId, uint128 newSrcAmount,
        uint128 newDstAmount, uint32 hintPrevOrder)
        public
        returns(bool)
    {
        require(maker == msg.sender);

        OrdersInterface list;

        if (isEthToToken) {
            list = buyList;
        } else {
            list = sellList;
        }

        require(updateOrder(maker, list, isEthToToken, orderId, newSrcAmount, newDstAmount, hintPrevOrder));
    }

    function updateOrderBatch(address maker, bool isEthToToken, uint32[] ordersId, uint128[] newSrcAmount,
        uint128[] newDstAmount, uint32[] hintPrevOrder)
        public
        returns(bool)
    {
        require(maker == msg.sender);
        require(ordersId.length == newSrcAmount.length);
        require(newSrcAmount.length == newDstAmount.length);
        require(newDstAmount.length == hintPrevOrder.length);
        OrdersInterface list;

        if (isEthToToken) {
            list = buyList;
        } else {
            list = sellList;
        }

        for (uint i = 0; i < ordersId.length; ++i) {
            require(updateOrder(maker, list, isEthToToken, ordersId[i], newSrcAmount[i], newDstAmount[i], hintPrevOrder[i]));
        }
    }

    function updateOrder(address maker, OrdersInterface list, bool isEthToToken, uint32 orderId, uint128 srcAmount,
        uint128 dstAmount, uint32 hintPrevOrder)
        internal
        returns(bool)
    {
        uint128 currDestAmount;
        uint128 currSrcAmount;
        address orderMaker;

        (orderMaker, currSrcAmount, currDestAmount, , ) = list.getOrderDetails(orderId);
        require(orderMaker == maker);

        validateUpdateOrder(maker, isEthToToken, currSrcAmount, currDestAmount, srcAmount, dstAmount);

        bool updatedWithHint = false;

        if (hintPrevOrder != 0) {

            updatedWithHint = list.updateWithPositionHint(orderId, srcAmount, dstAmount, hintPrevOrder);
        }

        if (!updatedWithHint) {

            list.update(orderId, srcAmount, dstAmount);
        }

        makeOrderUpdated(maker, isEthToToken, orderId, srcAmount, dstAmount, updatedWithHint);

        return true;
    }

    event MakerDepositedToken(address indexed maker, uint amountTwei);

    function makerDepositToken(address maker, uint amountTwei) public {
        require(maker != address(0));
        require(amountTwei < MAX_QTY);

        require(token.transferFrom(msg.sender, this, amountTwei));

        makerFunds[maker][token] += amountTwei;
        MakerDepositedToken(maker, amountTwei);
    }

    event MakerDepositedEth(address indexed maker, uint amountWei);

    function makerDepositWei(address maker) public payable {
        require(maker != address(0));

        makerFunds[maker][ETH_TOKEN_ADDRESS] += msg.value;
        MakerDepositedEth(maker, msg.value);
    }

    event MakerDepositedKnc(address indexed maker, uint amountTwei);

    function makerDepositKnc(address maker, uint amountTwei) public payable {
        require(maker != address(0));

        require(kncToken.transferFrom(msg.sender, this, amountTwei));

        KncStakes memory amounts = makerKncStakes[maker];

        amounts.freeKnc += uint128(amountTwei);
        makerKncStakes[maker] = amounts;

        MakerDepositedKnc(maker, amountTwei);

        require(allocateOrders(
            makerOrdersSell[maker], /* freeOrders */
            sellList.allocateIds(numOrdersToAllocate), /* firstAllocatedId */
            numOrdersToAllocate /* howMany */
        ));

        require(allocateOrders(
            makerOrdersBuy[maker], /* freeOrders */
            buyList.allocateIds(numOrdersToAllocate), /* firstAllocatedId */
            numOrdersToAllocate /* howMany */
        ));
    }

    function makerWithdrawFunds(ERC20 tokenOrEth, uint amount) public {

        address maker = msg.sender;
        uint makerFreeAmount = makerFunds[maker][tokenOrEth];

        require(makerFreeAmount >= amount);

        makerFunds[maker][tokenOrEth] -= amount;

        if (tokenOrEth == ETH_TOKEN_ADDRESS) {
            maker.transfer(amount);
        } else {
            require(token.transfer(maker, amount));
        }
    }

    event OrderCanceled(address indexed maker, uint32 orderId, uint srcAmount, uint dstAmount);
    function cancelOrder(bool isEthToToken, uint32 orderId) public returns(bool) {

        address maker = msg.sender;
        OrdersInterface list;
        ERC20 dst;

        if (isEthToToken) {
            list = buyList;
            dst == token;
        } else {
            list = sellList;
            dst = ETH_TOKEN_ADDRESS;
        }

        OrderData memory orderData;

        (orderData.maker, orderData.nextId, orderData.isLastOrder, orderData.srcAmount, orderData.dstAmount) =
            getOrderData(list, orderId);

        require(orderData.maker == maker);

        int weiAmount = calcWei(isEthToToken, orderData.srcAmount, orderData.dstAmount);

        require(handleOrderStakes(orderData.maker, uint(calcKncStake(weiAmount)), 0));

        list.removeById(orderId);

        //funds go back to maker
        makerFunds[maker][dst] += orderData.dstAmount;

        OrderCanceled(maker, orderId, orderData.srcAmount, orderData.dstAmount);

        return true;
    }

    function setFeeBurner(FeeBurnerSimpleIf burner) public {
        require(burner != address(0));
        require(feeBurnerResolverContract.getFeeBurnerAddress() == address(burner));

        require(kncToken.approve(feeBurnerContract, 0));

        feeBurnerContract = burner;

        require(kncToken.approve(feeBurnerContract, (2**255)));
    }

    function setStakePerEth(int newStakeBps) public {

        //todo: 2? 3? what factor is good for us?
        uint factor = 3;
        uint burnPerWeiBps = makersBurnFeeBps * feeBurnerContract.kncPerETHRate();

        // old factor should be too small
        require(uint(kncStakePerEtherBps) < factor * burnPerWeiBps);

        // new value should be high enough
        require(uint(newStakeBps) > factor * burnPerWeiBps);

        // but not too high...
        require(uint(newStakeBps) > (factor + 1) * burnPerWeiBps);

        // Ta daaa
        kncStakePerEtherBps = newStakeBps;
    }

    function getOrderDetails(bool isEthToToken, uint32 orderId) public view
        returns (
            address _maker,
            uint128 _srcAmount,
            uint128 _dstAmount,
            uint32 _prevId,
            uint32 _nextId
        )
    {
        OrdersInterface list;

        if (isEthToToken) {
            list = buyList;
        } else {
            list = sellList;
        }

        return list.getOrderDetails(orderId);
    }

    function getBuyOrderList() public view returns(uint32[] orderList) {

        OrdersInterface list = buyList;
        return getList(list);
    }

    function getSellOrderList() public view returns(uint32[] orderList) {

        OrdersInterface list = sellList;
        return getList(list);
    }

    function getList(OrdersInterface list) internal view returns(uint32[] memory orderList) {
        uint32 orderId;
        bool isEmpty;

        (orderId, isEmpty) = list.getFirstOrder();
        if (isEmpty) return(new uint32[](0));

        uint numOrders = 0;
        bool isLast = false;

        while (!isLast) {
            (orderId, isLast) = list.getNextOrder(orderId);
            numOrders++;
        }

        orderList = new uint32[](numOrders);

        (orderId, isEmpty) = list.getFirstOrder();

        for (uint i = 0; i < numOrders; i++) {
            orderList[i] = orderId;
            (orderId, isLast) = list.getNextOrder(orderId);
        }
    }

    function bindOrderFunds(address maker, bool isEthToToken, int256 dstAmount)
        internal
        returns(bool)
    {
        address myToken;

        if (isEthToToken) {

            myToken = token;
        } else {

            myToken = ETH_TOKEN_ADDRESS;
        }

        if (dstAmount < 0) {

            makerFunds[maker][myToken] += uint256(-dstAmount);
        } else {

            require(makerFunds[maker][myToken] >= uint256(dstAmount));
            makerFunds[maker][myToken] -= uint256(dstAmount);
        }

        return true;
    }

    function calcKncStake(int weiAmount) public view returns(int) {
        return(weiAmount * kncStakePerEtherBps / 1000);
    }

    function calcBurnAmount(int weiAmount) public view returns(uint) {
        return(uint(weiAmount) * makersBurnFeeBps * feeBurnerContract.kncPerETHRate() / 1000);
    }

    function makerUnusedKNC(address maker) public view returns (uint) {
        return (uint(makerKncStakes[maker].freeKnc));
    }

    function makerStakedKNC(address maker) public view returns (uint) {
        return (uint(makerKncStakes[maker].kncOnStake));
    }

    // TODO: is this call required? Maybe extract isLastOrder funtion from it...
    function getOrderData(OrdersInterface list, uint32 orderId) internal view
        returns (
            address maker,
            uint32 nextId,
            bool isLastOrder,
            uint128 srcAmount,
            uint128 dstAmount
        )
    {
        (maker, srcAmount, dstAmount, , nextId) = list.getOrderDetails(orderId);

        return (
            maker,
            nextId,
            nextId == orderListTailId, /* isLastOrder */
            srcAmount,
            dstAmount
        );
    }

    function bindOrderStakes(address maker, int stakeAmountTwei) internal returns(bool) {

        KncStakes storage amounts = makerKncStakes[maker];

        require(amounts.freeKnc >= stakeAmountTwei);

        if (stakeAmountTwei >= 0) {
            amounts.freeKnc -= uint128(stakeAmountTwei);
            amounts.kncOnStake += uint128(stakeAmountTwei);
        } else {
            amounts.freeKnc += uint128(-stakeAmountTwei);
            require(amounts.kncOnStake - uint128(-stakeAmountTwei) < amounts.kncOnStake);
            amounts.kncOnStake -= uint128(-stakeAmountTwei);
        }

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

    ///@dev funds are valid only when required knc amount can be staked for this order.
    function validateOrder(address maker, bool isEthToToken, uint128 srcAmount, uint128 dstAmount)
        internal returns(bool)
    {
        require(bindOrderFunds(maker, isEthToToken, int256(dstAmount)));

        int weiAmount = calcWei(isEthToToken, srcAmount, dstAmount);

        require(uint(weiAmount) >= minOrderMakeValueWei);
        require(bindOrderStakes(maker, calcKncStake(weiAmount)));

        return true;
    }

    ///@dev funds are valid only when required knc amount can be staked for this order.
    function validateUpdateOrder(address maker, bool isEthToToken, uint128 prevSrcAmount, uint128 prevDstAmount,
        uint128 newSrcAmount, uint128 newDstAmount)
        internal
        returns(bool)
    {
        uint weiAmount;
        int weiDiff;

        if (isEthToToken) {
            weiAmount = newSrcAmount;
            weiDiff = int(newSrcAmount) - int(prevSrcAmount);
        } else {
            weiAmount = newDstAmount;
            weiDiff = int(newDstAmount) - int(prevDstAmount);
        }

        require(weiAmount >= minOrderMakeValueWei);

        require(bindOrderFunds(maker, isEthToToken, int256(int256(newDstAmount) - int256(prevDstAmount))));

        require(bindOrderStakes(maker, calcKncStake(weiDiff)));

        return true;
    }

    function takeFullOrder(
        uint32 orderId,
        ERC20 src,
        ERC20 dest,
        address maker,
        uint128 orderSrcAmount,
        uint128 orderDstAmount
    )
        internal
        returns (bool)
    {
        bool isEthToToken;
        dest;

        if (src == ETH_TOKEN_ADDRESS) {
            buyList.removeById(orderId);
            isEthToToken = true;

        } else {
            sellList.removeById(orderId);
            isEthToToken = false;
        }

        return takeOrder(maker, isEthToToken, orderSrcAmount, orderDstAmount);
    }

    function takePartialOrder(
        uint32 orderId,
        address maker,
        ERC20 src,
        ERC20 dest,
        uint128 partialSrcAmount,
        uint128 partialDstAmount,
        uint128 orderSrcAmount,
        uint128 orderDstAmount
    )
        internal
        returns(bool)
    {
        require(partialSrcAmount < orderSrcAmount);
        require(partialDstAmount < orderDstAmount);

        orderSrcAmount -= partialSrcAmount;
        orderDstAmount -= partialDstAmount;

        OrdersInterface list;
        bool isEthToToken;

        uint remainingWeiValue;
        if (src == ETH_TOKEN_ADDRESS) {
            remainingWeiValue = orderSrcAmount;
            list = buyList;
            isEthToToken = true;
        } else {
            remainingWeiValue = orderDstAmount;
            list = sellList;
            isEthToToken = false;
        }

        if (remainingWeiValue < minOrderValueWei) {
            // remaining order amount too small. remove order and add remaining funds to free funds
            makerFunds[maker][dest] += orderDstAmount;
            handleOrderStakes(maker, remainingWeiValue, 0);
            list.removeById(orderId);
        } else {
            // update order values in storage
            uint128 subDst = list.subSrcAndDstAmounts(orderId, partialSrcAmount);
            require(subDst == partialDstAmount);
        }

        return(takeOrder(maker, isEthToToken, partialSrcAmount, partialDstAmount));
    }

    function takeOrder(
        address maker,
        bool isEthToToken,
        uint srcAmount,
        uint dstAmount
    )
        internal
        returns(bool)
    {
        int weiAmount = calcWei(isEthToToken, srcAmount, dstAmount);

        //tokens already collected. just update maker balance
        makerFunds[maker][isEthToToken? ETH_TOKEN_ADDRESS : token] += srcAmount;

        // send dest tokens in one batch. not here

        //handle knc stakes and fee
        handleOrderStakes(maker, uint(calcKncStake(weiAmount)), calcBurnAmount(weiAmount));

        return true;
    }

    function calcWei(bool isEthToToken, uint srcAmount, uint dstAmount) internal pure returns(int) {

        int weiAmount;

        if (isEthToToken) {
            weiAmount = int(srcAmount);
        } else {
            weiAmount = int(dstAmount);
        }

        require(weiAmount > 0);
        return weiAmount;
    }
}
