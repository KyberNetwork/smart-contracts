pragma solidity 0.4.18;


import "./OrdersInterface.sol";
import "./OrderIdManager.sol";
import "./FeeBurnerResolverInterface.sol";
import "./OrderFactoryInterface.sol";
import "./OrderBookReserveInterface.sol";
import "../Utils2.sol";
import "../KyberReserveInterface.sol";


contract FeeBurnerRateInterface {
    uint public kncPerEthRatePrecision;
}


contract OrderBookReserve is OrderIdManager, Utils2, KyberReserveInterface, OrderBookReserveInterface {

    uint public minOrderValueWei = 10 ** 18;                 // below this value order will be removed.
    uint public minOrderMakeValueWei = 2 * minOrderValueWei; // Below this value can't create new order.
    uint public makerBurnFeeBps;                             // knc burn fee per order that is taken.

    ERC20 public token; // this reserve will serve only this token vs ETH.
    FeeBurnerRateInterface public feeBurnerContract;
    FeeBurnerResolverInterface public feeBurnerResolverContract;
    OrderFactoryInterface ordersFactoryContract;

    ERC20 public kncToken;  //not constant. to enable testing and test net usage
    uint public kncStakePerEtherBps = 20000; //for validating orders
    uint public numOrdersToAllocate = 256;

    OrdersInterface public tokenToEthList;
    OrdersInterface public ethToTokenList;

    uint32 orderListTailId;
    uint32 orderListHeadId;

    // KNC stake
    struct KncStake {
        uint128 freeKnc;    // knc that can be used to validate funds
        uint128 kncOnStake; // per order some knc will move to be kncOnStake. part of it will be used for burning.
    }

    //funds data
    mapping(address => mapping(address => uint)) public makerFunds; // deposited maker funds,
    mapping(address => KncStake) public makerKncStake; // knc funds are required for validating deposited funds

    //each maker will have orders that will be reused.
    mapping(address => OrdersData) public makerOrdersTokenToEth;
    mapping(address => OrdersData) public makerOrdersEthToToken;

    struct OrderData {
        address maker;
        uint32 nextId;
        bool isLastOrder;
        uint128 srcAmount;
        uint128 dstAmount;
    }

    function OrderBookReserve(
        ERC20 knc,
        ERC20 reserveToken,
        FeeBurnerResolverInterface resolver,
        OrderFactoryInterface factory,
        uint minOrderMakeWei,
        uint minOrderWei,
        uint burnFeeBps
    )
        public
    {

        require(knc != address(0));
        require(reserveToken != address(0));
        require(resolver != address(0));
        require(factory != address(0));
        require(burnFeeBps != 0);
        require(minOrderWei != 0);
        require(minOrderMakeWei > minOrderWei);

        feeBurnerResolverContract = resolver;
        feeBurnerContract = FeeBurnerRateInterface(feeBurnerResolverContract.getFeeBurnerAddress());
        kncToken = knc;
        token = reserveToken;
        ordersFactoryContract = factory;
        makerBurnFeeBps = burnFeeBps;
        minOrderMakeValueWei = minOrderMakeWei;
        minOrderValueWei = minOrderWei;

        require(kncToken.approve(feeBurnerContract, (2**255)));

        //can only support tokens with decimal() API
        setDecimals(token);
    }

    ///@dev separate init function for this contract, if this init is in the C'tor. gas consumption too high.
    function init() public returns(bool) {
        require(tokenToEthList == address(0));
        require(ethToTokenList == address(0));

        tokenToEthList = ordersFactoryContract.newOrdersContract(this);
        ethToTokenList = ordersFactoryContract.newOrdersContract(this);

        orderListTailId = ethToTokenList.getTailId();
        orderListHeadId = ethToTokenList.getHeadId();

        return true;
    }

    function getConversionRate(ERC20 src, ERC20 dst, uint srcQty, uint blockNumber) public view returns(uint) {

        require((src == ETH_TOKEN_ADDRESS) || (dst == ETH_TOKEN_ADDRESS));
        require((src == token) || (dst == token));
        blockNumber; // in this reserve no order expiry == no use for blockNumber. here to avoid compiler warning.

        //user order ETH -> token is matched with maker order token -> ETH
        OrdersInterface list = (src == ETH_TOKEN_ADDRESS) ? tokenToEthList : ethToTokenList;

        uint32 orderId;
        OrderData memory orderData;

        //orderId, isEmptyList
        (orderId, orderData.isLastOrder) = list.getFirstOrder();

        uint128 userRemainingSrcQty = uint128(srcQty);
        uint128 totalUserDstAmount = 0;

        for (; ((userRemainingSrcQty > 0) && !orderData.isLastOrder); orderId = orderData.nextId) {

            orderData = getOrderData(list, orderId);
            // user src quantity is matched with maker dst quantity
            if (orderData.dstAmount <= userRemainingSrcQty) {
                totalUserDstAmount += orderData.srcAmount;
                userRemainingSrcQty -= orderData.dstAmount;
            } else {
                totalUserDstAmount += orderData.srcAmount * userRemainingSrcQty / orderData.dstAmount;
                userRemainingSrcQty = 0;
            }
        }

        if (userRemainingSrcQty != 0) return 0; //not enough tokens to exchange.

        return calcRateFromQty(srcQty, totalUserDstAmount, getDecimals(src), getDecimals(dst));
    }

    function trade(
        ERC20 srcToken,
        uint srcAmount,
        ERC20 dstToken,
        address dstAddress,
        uint conversionRate,
        bool validate
    )
        public
        payable
        returns(bool)
    {
        require((srcToken == ETH_TOKEN_ADDRESS) || (dstToken == ETH_TOKEN_ADDRESS));
        require((srcToken == token) || (dstToken == token));

        conversionRate;
        validate;
        OrdersInterface list = (srcToken == ETH_TOKEN_ADDRESS) ? tokenToEthList : ethToTokenList;

        if (srcToken == ETH_TOKEN_ADDRESS) {
            require(msg.value == srcAmount);
        } else {
            require(msg.value == 0);
            require(srcToken.transferFrom(msg.sender, this, srcAmount));
        }

        uint32 orderId;
        OrderData memory orderData;

        //getFirstOrder return values: (orderId, isEmptyList)
        (orderId, orderData.isLastOrder) = list.getFirstOrder();

        uint128 userRemainingSrcQty = uint128(srcAmount);
        uint128 totalUserDstAmount = 0;

        for (; (userRemainingSrcQty > 0) && !orderData.isLastOrder; orderId = orderData.nextId) {

            orderData = getOrderData(list, orderId);
            if (orderData.dstAmount <= userRemainingSrcQty) {
                totalUserDstAmount += orderData.srcAmount;
                userRemainingSrcQty -= orderData.dstAmount;
                require(takeFullOrder(orderData.maker, orderId, srcToken, dstToken,
                    orderData.dstAmount, orderData.srcAmount));
            } else {
                uint128 partialDstQty = orderData.srcAmount * userRemainingSrcQty / orderData.dstAmount;
                totalUserDstAmount += partialDstQty;
                require(takePartialOrder(orderData.maker, orderId, srcToken, dstToken, userRemainingSrcQty,
                    partialDstQty, orderData.srcAmount, orderData.dstAmount));
                userRemainingSrcQty = 0;
            }
        }

        require(userRemainingSrcQty == 0 && totalUserDstAmount > 0);

        //all orders were successfully taken. send to dstAddress
        if (dstToken == ETH_TOKEN_ADDRESS) {
            dstAddress.transfer(totalUserDstAmount);
        } else {
            require(dstToken.transfer(dstAddress, totalUserDstAmount));
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

    ///@param srcAmount is the token amount that will be payed. must be deposited before hand in the makers account.
    ///@param dstAmount is the eth amount the maker expects to get for his tokens.
    function submitTokenToEthOrder(uint128 srcAmount, uint128 dstAmount)
        public
        returns(bool)
    {
        return submitTokenToEthOrderWHint(srcAmount, dstAmount, 0);
    }

    function submitTokenToEthOrderWHint(uint128 srcAmount, uint128 dstAmount, uint32 hintPrevOrder)
        public
        returns(bool)
    {
        address maker = msg.sender;
        uint32 newId = getNewOrderId(makerOrdersTokenToEth[maker]);

        return addOrder(maker, false, newId, srcAmount, dstAmount, hintPrevOrder);
    }

    ///@param srcAmount is the Ether amount that will be payed, must be deposited before hand.
    ///@param dstAmount is the token amount the maker expects to get for his Ether.
    function submitEthToTokenOrder(uint128 srcAmount, uint128 dstAmount)
        public
        returns(bool)
    {
        return submitEthToTokenOrderWHint(srcAmount, dstAmount, 0);
    }

    function submitEthToTokenOrderWHint(uint128 srcAmount, uint128 dstAmount, uint32 hintPrevOrder)
        public
        returns(bool)
    {
        address maker = msg.sender;
        uint32 newId = getNewOrderId(makerOrdersEthToToken[maker]);

        return addOrder(maker, true, newId, srcAmount, dstAmount, hintPrevOrder);
    }

    function addOrderBatch(bool[] isEthToToken, uint128[] srcAmount, uint128[] dstAmount,
        uint32[] hintPrevOrder, bool[] isAfterPrevOrder)
        public
        returns(bool)
    {
        require(isEthToToken.length == hintPrevOrder.length);
        require(isEthToToken.length == dstAmount.length);
        require(isEthToToken.length == srcAmount.length);
        require(isEthToToken.length == isAfterPrevOrder.length);

        address maker = msg.sender;

        uint32 prevId;
        uint32 newId = 0;

        for (uint i = 0; i < isEthToToken.length; ++i) {
            prevId = isAfterPrevOrder[i] ? newId : hintPrevOrder[i];
            newId = isEthToToken[i] ? getNewOrderId(makerOrdersEthToToken[maker]) : getNewOrderId(makerOrdersTokenToEth[maker]);
            require(addOrder(maker, isEthToToken[i], newId, srcAmount[i], dstAmount[i], prevId));
        }

        return true;
    }

    event OrderUpdated(
        address indexed maker,
        bool isEthToToken,
        uint orderId,
        uint128 srcAmount,
        uint128 dstAmount,
        bool updatedWithHint
    );

    function updateTokenToEthOrder(uint32 orderId, uint128 newSrcAmount, uint128 newDstAmount)
        public
        returns(bool)
    {
        return updateTokenToEthOrderWHint(orderId, newSrcAmount, newDstAmount, 0);
    }

    function updateTokenToEthOrderWHint(uint32 orderId, uint128 newSrcAmount, uint128 newDstAmount, uint32 hintPrevOrder)
        public
        returns(bool)
    {
        address maker = msg.sender;

        return updateOrder(maker, false, orderId, newSrcAmount, newDstAmount, hintPrevOrder);
    }

    function updateEthToTokenOrder(uint32 orderId, uint128 newSrcAmount, uint128 newDstAmount)
        public
        returns(bool)
    {
        return updateEthToTokenOrderWHint(orderId, newSrcAmount, newDstAmount, 0);
    }

    function updateEthToTokenOrderWHint(uint32 orderId, uint128 newSrcAmount, uint128 newDstAmount, uint32 hintPrevOrder)
        public
        returns(bool)
    {
        address maker = msg.sender;

        return updateOrder(maker, true, orderId, newSrcAmount, newDstAmount, hintPrevOrder);
    }

    function updateOrderBatch(bool[] isEthToToken, uint32[] orderId, uint128[] newSrcAmount,
        uint128[] newDstAmount, uint32[] hintPrevOrder)
        public
        returns(bool)
    {
        require(isEthToToken.length == orderId.length);
        require(isEthToToken.length == newSrcAmount.length);
        require(isEthToToken.length == newDstAmount.length);
        require(isEthToToken.length == hintPrevOrder.length);

        address maker = msg.sender;

        for (uint i = 0; i < isEthToToken.length; ++i) {
            require(updateOrder(maker, isEthToToken[i], orderId[i], newSrcAmount[i], newDstAmount[i], hintPrevOrder[i]));
        }

        return true;
    }

    event TokenDeposited(address indexed maker, uint amount);

    function depositToken(address maker, uint amount) public {
        require(maker != address(0));
        require(amount < MAX_QTY);

        require(token.transferFrom(msg.sender, this, amount));

        makerFunds[maker][token] += amount;
        TokenDeposited(maker, amount);
    }

    event EtherDeposited(address indexed maker, uint amount);

    function depositEther(address maker) public payable {
        require(maker != address(0));

        makerFunds[maker][ETH_TOKEN_ADDRESS] += msg.value;
        EtherDeposited(maker, msg.value);
    }

    event KncFeeDeposited(address indexed maker, uint amount);

    function depositKncFee(address maker, uint amount) public {
        require(maker != address(0));
        require(amount < MAX_QTY);

        require(kncToken.transferFrom(msg.sender, this, amount));

        makerKncStake[maker].freeKnc += uint128(amount);

        KncFeeDeposited(maker, amount);

        if (orderAllocationRequired(makerOrdersTokenToEth[maker], numOrdersToAllocate)) {
            require(allocateOrders(
                makerOrdersTokenToEth[maker], /* freeOrders */
                tokenToEthList.allocateIds(uint32(numOrdersToAllocate)), /* firstAllocatedId */
                numOrdersToAllocate /* howMany */
            ));
        }

        if (orderAllocationRequired(makerOrdersEthToToken[maker], numOrdersToAllocate)) {
            require(allocateOrders(
                makerOrdersEthToToken[maker], /* freeOrders */
                ethToTokenList.allocateIds(uint32(numOrdersToAllocate)), /* firstAllocatedId */
                numOrdersToAllocate /* howMany */
            ));
        }
    }

    function withdrawToken(uint amount) public {

        address maker = msg.sender;
        uint makerFreeAmount = makerFunds[maker][token];

        require(makerFreeAmount >= amount);

        makerFunds[maker][token] -= amount;

        require(token.transfer(maker, amount));
    }

    function withdrawEther(uint amount) public {

        address maker = msg.sender;
        uint makerFreeAmount = makerFunds[maker][ETH_TOKEN_ADDRESS];

        require(makerFreeAmount >= amount);

        makerFunds[maker][ETH_TOKEN_ADDRESS] -= amount;

        maker.transfer(amount);
    }

    function withdrawKncFee(uint amount) public {

        address maker = msg.sender;
        uint256 makerFreeAmount = uint256(makerKncStake[maker].freeKnc);

        require(makerFreeAmount >= amount);

        require(uint256(uint128(amount)) == amount);

        makerKncStake[maker].freeKnc -= uint128(amount);

        require(kncToken.transfer(maker, amount));
    }

    function cancelTokenToEthOrder(uint32 orderId) public returns(bool) {
        require(cancelOrder(false, orderId));
        return true;
    }

    function cancelEthToTokenOrder(uint32 orderId) public returns(bool) {
        require(cancelOrder(true, orderId));
        return true;
    }

    function addOrder(address maker, bool isEthToToken, uint32 newId, uint128 srcAmount, uint128 dstAmount,
        uint32 hintPrevOrder
    )
        internal
        returns(bool)
    {
        require(validateAddOrder(maker, isEthToToken, srcAmount, dstAmount));
        bool addedWithHint = false;

        OrdersInterface list = isEthToToken ? ethToTokenList : tokenToEthList;

        if (hintPrevOrder != 0) {
            addedWithHint = list.addAfterId(maker, newId, srcAmount, dstAmount, hintPrevOrder);
        }

        if (addedWithHint == false) {
            list.add(maker, newId, srcAmount, dstAmount);
        }

        NewMakeOrder(maker, newId, isEthToToken, srcAmount, dstAmount, addedWithHint);

        return true;
    }

    function updateOrder(address maker, bool isEthToToken, uint32 orderId, uint128 newSrcAmount,
        uint128 newDstAmount, uint32 hintPrevOrder)
        internal
        returns(bool)
    {
        uint128 currDstAmount;
        uint128 currSrcAmount;
        address orderMaker;

        OrdersInterface list = isEthToToken ? ethToTokenList : tokenToEthList;

        (orderMaker, currSrcAmount, currDstAmount, , ) = list.getOrderDetails(orderId);
        require(orderMaker == maker);

        if (!validateUpdateOrder(maker, isEthToToken, currSrcAmount, currDstAmount, newSrcAmount, newDstAmount)) return false;

        bool updatedWithHint = false;

        if (hintPrevOrder != 0) {
            (updatedWithHint, ) = list.updateWithPositionHint(orderId, newSrcAmount, newDstAmount, hintPrevOrder);
        }

        if (!updatedWithHint) {
            list.update(orderId, newSrcAmount, newDstAmount);
        }

        OrderUpdated(maker, isEthToToken, orderId, newSrcAmount, newDstAmount, updatedWithHint);

        return true;
    }

    event OrderCanceled(address indexed maker, bool isEthToToken, uint32 orderId, uint128 srcAmount, uint dstAmount);
    function cancelOrder(bool isEthToToken, uint32 orderId) internal returns(bool) {

        address maker = msg.sender;
        OrdersInterface list = isEthToToken ? ethToTokenList : tokenToEthList;
        OrderData memory orderData = getOrderData(list, orderId);

        require(orderData.maker == maker);

        uint weiAmount = isEthToToken ? orderData.srcAmount : orderData.dstAmount;

        require(handleOrderStakes(orderData.maker, uint(calcKncStake(int(weiAmount))), 0));

        require(removeOrder(list, maker, isEthToToken ? ETH_TOKEN_ADDRESS : token, orderId));

        //funds go back to makers account
        makerFunds[maker][isEthToToken ? ETH_TOKEN_ADDRESS : token] += orderData.srcAmount;

        OrderCanceled(maker, isEthToToken, orderId, orderData.srcAmount, orderData.dstAmount);

        return true;
    }

    event FeeBurnerContractSet(address currentBurner, address newBurner, address sender);
    function setFeeBurner(FeeBurnerRateInterface burner) public {
        require(burner != address(0));
        require(feeBurnerResolverContract.getFeeBurnerAddress() == address(burner));
        require(kncToken.approve(feeBurnerContract, 0));

        FeeBurnerContractSet(feeBurnerContract, burner, msg.sender);

        feeBurnerContract = burner;
        require(kncToken.approve(feeBurnerContract, (2**255)));
    }

    event KncStakePerEthSet(uint currectStakeBps, uint newStakeBps, address feeBurnerContract, address sender);
    function setStakePerEth(uint newStakeBps) public {

        //todo: 2? 3? what factor is good for us?
        uint factor = 3;
        uint burnPerWeiBps = (makerBurnFeeBps * feeBurnerContract.kncPerEthRatePrecision()) / PRECISION;

        // old factor should be too small
        require(kncStakePerEtherBps < factor * burnPerWeiBps);

        // new value should be high enough
        require(newStakeBps > factor * burnPerWeiBps);

        // but not too high...
        require(newStakeBps > (factor + 1) * burnPerWeiBps);

        KncStakePerEthSet(kncStakePerEtherBps, newStakeBps, feeBurnerContract, msg.sender);
        // Ta daaa
        kncStakePerEtherBps = newStakeBps;
    }

    function getAddOrderHintTokenToEth(uint128 srcAmount, uint128 dstAmount) public view returns (uint32) {
        require(srcAmount >= minOrderMakeValueWei);
        return tokenToEthList.findPrevOrderId(srcAmount, dstAmount);
    }

    function getAddOrderHintEthToToken(uint128 srcAmount, uint128 dstAmount) public view returns (uint32) {
        require(dstAmount >= minOrderMakeValueWei);
        return ethToTokenList.findPrevOrderId(srcAmount, dstAmount);
    }

    function getUpdateOrderHintTokenToEth(uint32 orderId, uint128 srcAmount, uint128 dstAmount)
        public
        view
        returns (uint32)
    {
        require(srcAmount >= minOrderMakeValueWei);
        uint32 prevId = tokenToEthList.findPrevOrderId(srcAmount, dstAmount);

        if (prevId == orderId) {
            (,,, prevId,) = tokenToEthList.getOrderDetails(orderId);
        }

        return prevId;
    }

    function getUpdateOrderHintEthToToken(uint32 orderId, uint128 srcAmount, uint128 dstAmount)
        public
        view
        returns (uint32)
    {
        require(dstAmount >= minOrderMakeValueWei);
        uint32 prevId = ethToTokenList.findPrevOrderId(srcAmount, dstAmount);

        if (prevId == orderId) {
            (,,, prevId,) = ethToTokenList.getOrderDetails(orderId);
        }

        return prevId;
    }

    function getTokenToEthOrder(uint32 orderId) public view
        returns (
            address _maker,
            uint128 _srcAmount,
            uint128 _dstAmount,
            uint32 _prevId,
            uint32 _nextId
        )
    {
        return tokenToEthList.getOrderDetails(orderId);
    }

    function getEthToTokenOrder(uint32 orderId) public view
        returns (
            address _maker,
            uint128 _srcAmount,
            uint128 _dstAmount,
            uint32 _prevId,
            uint32 _nextId
        )
    {
        return ethToTokenList.getOrderDetails(orderId);
    }

    function getEthToTokenOrderList() public view returns(uint32[] orderList) {

        OrdersInterface list = ethToTokenList;
        return getList(list);
    }

    function getTokenToEthOrderList() public view returns(uint32[] orderList) {

        OrdersInterface list = tokenToEthList;
        return getList(list);
    }

    function getList(OrdersInterface list) internal view returns(uint32[] memory orderList) {
        OrderData memory orderData;

        uint32 orderId;
        bool isEmpty;

        (orderId, isEmpty) = list.getFirstOrder();
        if (isEmpty) return(new uint32[](0));

        uint numOrders = 0;

        for (; !orderData.isLastOrder; orderId = orderData.nextId) {
            orderData = getOrderData(list, orderId);
            numOrders++;
        }

        orderList = new uint32[](numOrders);

        (orderId, orderData.isLastOrder) = list.getFirstOrder();

        for (uint i = 0; i < numOrders; i++) {
            orderList[i] = orderId;
            orderData = getOrderData(list, orderId);
            orderId = orderData.nextId;
        }
    }

    ///@param maker is the maker of this order
    ///@param isEthToToken which order type the maker is updating / adding
    ///@param srcAmount is the orders src amount (token or ETH) could be negative if funds are released.
    function bindOrderFunds(address maker, bool isEthToToken, int256 srcAmount)
        internal
        returns(bool)
    {
        address fundsAddress = isEthToToken ? ETH_TOKEN_ADDRESS : token;

        if (srcAmount < 0) {
            makerFunds[maker][fundsAddress] += uint256(-srcAmount);
        } else {
            require(makerFunds[maker][fundsAddress] >= uint256(srcAmount));
            makerFunds[maker][fundsAddress] -= uint256(srcAmount);
        }

        return true;
    }

    function calcKncStake(int weiAmount) public view returns(int) {
        return(weiAmount * int(kncStakePerEtherBps) / 1000);
    }

    function calcBurnAmount(uint weiAmount) public view returns(uint) {
        return(weiAmount * makerBurnFeeBps * feeBurnerContract.kncPerEthRatePrecision() / (1000 * PRECISION));
    }

    function makerUnusedKNC(address maker) public view returns (uint) {
        return (uint(makerKncStake[maker].freeKnc));
    }

    function makerStakedKNC(address maker) public view returns (uint) {
        return (uint(makerKncStake[maker].kncOnStake));
    }

    function getOrderData(OrdersInterface list, uint32 orderId) internal view returns (OrderData data)
    {
        (data.maker, data.srcAmount, data.dstAmount, , data.nextId) = list.getOrderDetails(orderId);
        data.isLastOrder = (data.nextId == orderListTailId);
    }

    function bindOrderStakes(address maker, int stakeAmount) internal returns(bool) {

        KncStake storage amounts = makerKncStake[maker];

        require(amounts.freeKnc >= stakeAmount);

        if (stakeAmount >= 0) {
            amounts.freeKnc -= uint128(stakeAmount);
            amounts.kncOnStake += uint128(stakeAmount);
        } else {
            amounts.freeKnc += uint128(-stakeAmount);
            require(amounts.kncOnStake - uint128(-stakeAmount) < amounts.kncOnStake);
            amounts.kncOnStake -= uint128(-stakeAmount);
        }

        return true;
    }

    ///@dev if burnAmount is 0 we only release stakes.
    ///@dev if burnAmount == stakedAmount. all staked amount will be burned. so no knc returned to maker
    function handleOrderStakes(address maker, uint stakedAmount, uint burnAmount) internal returns(bool) {

        KncStake storage amounts = makerKncStake[maker];

        //if knc rate had a big change. Previous stakes might not be enough. but can still take order.
        if (amounts.kncOnStake < uint128(stakedAmount)) stakedAmount = amounts.kncOnStake;
        if (burnAmount > stakedAmount) burnAmount = stakedAmount;

        amounts.kncOnStake -= uint128(stakedAmount);
        amounts.freeKnc += uint128(stakedAmount - burnAmount);

        return true;
    }

    ///@dev funds are valid only when required knc amount can be staked for this order.
    function validateAddOrder(address maker, bool isEthToToken, uint128 srcAmount, uint128 dstAmount)
        internal returns(bool)
    {
        require(bindOrderFunds(maker, isEthToToken, int256(srcAmount)));

        uint weiAmount = isEthToToken ? srcAmount : dstAmount;

        require(uint(weiAmount) >= minOrderMakeValueWei);
        require(bindOrderStakes(maker, calcKncStake(int(weiAmount))));

        return true;
    }

    ///@dev funds are valid only when required knc amount can be staked for this order.
    function validateUpdateOrder(address maker, bool isEthToToken, uint128 prevSrcAmount, uint128 prevDstAmount,
        uint128 newSrcAmount, uint128 newDstAmount)
        internal
        returns(bool)
    {
        uint weiAmount = isEthToToken ? newSrcAmount : newDstAmount;
        int weiDiff = isEthToToken ? (int(newSrcAmount) - int(prevSrcAmount)) : (int(newDstAmount) - int(prevDstAmount));

        require(weiAmount >= minOrderMakeValueWei);

        require(bindOrderFunds(maker, isEthToToken, int(int(newSrcAmount) - int(prevSrcAmount))));

        require(bindOrderStakes(maker, calcKncStake(weiDiff)));

        return true;
    }

    function takeFullOrder(
        address maker,
        uint32 orderId,
        ERC20 userSrc,
        ERC20 userDst,
        uint128 userSrcAmount,
        uint128 userDstAmount
    )
        internal
        returns (bool)
    {
        OrdersInterface list = (userSrc == ETH_TOKEN_ADDRESS) ? tokenToEthList : ethToTokenList;

        //userDst == maker source
        require(removeOrder(list, maker, userDst, orderId));

        return takeOrder(maker, userSrc, userSrcAmount, userDstAmount, 0);
    }

    function takePartialOrder(
        address maker,
        uint32 orderId,
        ERC20 userSrc,
        ERC20 userDst,
        uint128 userPartialSrcAmount,
        uint128 userTakeDstAmount,
        uint128 orderSrcAmount,
        uint128 orderDstAmount
    )
        internal
        returns(bool)
    {
        require(userPartialSrcAmount < orderDstAmount);
        require(userTakeDstAmount < orderSrcAmount);

        orderSrcAmount -= userTakeDstAmount;
        orderDstAmount -= userPartialSrcAmount;

        OrdersInterface list = (userSrc == ETH_TOKEN_ADDRESS) ? tokenToEthList : ethToTokenList;
        uint remainingWeiValue = (userSrc == ETH_TOKEN_ADDRESS) ? orderDstAmount : orderSrcAmount;

        if (remainingWeiValue < minOrderValueWei) {
            // remaining order amount too small. remove order and add remaining funds to free funds
            makerFunds[maker][userDst] += orderSrcAmount;

            //for remove order we give makerSrc == userDst
            require(removeOrder(list, maker, userDst, orderId));
        } else {
            // update order values, taken order is always first order
            list.updateWithPositionHint(orderId, orderSrcAmount, orderDstAmount, orderListHeadId);
        }

        //stakes are returned for unused wei value
        return(takeOrder(maker, userSrc, userPartialSrcAmount, userTakeDstAmount, remainingWeiValue));
    }

    function takeOrder(
        address maker,
        ERC20 userSrc,
        uint userSrcAmount,
        uint userDstAmount,
        uint releasedWeiValue
    )
        internal
        returns(bool)
    {
        uint weiAmount = userSrc == (ETH_TOKEN_ADDRESS) ? userSrcAmount : userDstAmount;

        //token / eth already collected. just update maker balance
        makerFunds[maker][userSrc] += userSrcAmount;

        // send dst tokens in one batch. not here

        //handle knc stakes and fee. releasedWeiValue was released and not traded.
        return handleOrderStakes(maker, uint(calcKncStake(int(weiAmount + releasedWeiValue))),
            calcBurnAmount(weiAmount));
    }

    function removeOrder(
        OrdersInterface list,
        address maker,
        ERC20 makerSrc,
        uint32 orderId
    )
        internal returns(bool)
    {
        require(list.removeById(orderId));
        OrdersData storage orders = (makerSrc == ETH_TOKEN_ADDRESS) ?
            makerOrdersEthToToken[maker] : makerOrdersTokenToEth[maker];
        releaseOrderId(orders, orderId);

        return true;
    }
}
