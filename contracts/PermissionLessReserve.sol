pragma solidity 0.4.18;


import "./Orders.sol";
import "./MakerOrders.sol";
import "./KyberReserveInterface.sol";
import "./FeeBurner.sol";


contract PermissionLessReserve is Utils2, MakerOrders, KyberReserveInterface {

    uint public minOrderValueWei = 10 ** 18;                 // below this value order will be removed.
    uint public minOrderMakeWeiValue = 2 * minOrderValueWei; // Below this value can't create new order.
    uint public makersBurnFeeBps = 25;              // knc burn fee per order that is taken. = 25 / 1000 = 0.25 %

    ERC20 public reserveToken; // this reserve will serve buy / sell for this token.
    FeeBurner public feeBurnerContract;
    address public admin;

    ERC20 public kncToken;  //can't be constant. to enable testing and test net usage
    uint public kncStakePerEtherBPS = 20000; //for validating orders
    uint32 public numOrdersToAllocate = 60;

    Orders sellList;
    Orders buyList;

    // KNC stakes
    struct KncStakes {
        uint128 freeKnc;    // knc that can be used to validate funds
        uint128 kncOnStake; // per order some knc will move to be kncOnStake. part of it will be used for burning.
    }

    //funds data
    mapping(address => mapping(address => uint)) public makerFunds; // deposited maker funds,
            // where order added funds are subtracted here and added to order
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

        sellList = new Orders(this);
        buyList = new Orders(this);

        //notice. if decimal API not supported this should revert
        setDecimals(reserveToken);
        require(getDecimals(reserveToken) <= MAX_DECIMALS);
    }

    function getConversionRate(ERC20 src, ERC20 dest, uint totalSrcAmount, uint blockNumber) public view returns(uint) {

        require((src == ETH_TOKEN_ADDRESS) || (dest == ETH_TOKEN_ADDRESS));
        require((src == reserveToken) || (dest == reserveToken));
        blockNumber; // in this reserve no order expiry == no use for blockNumber. here to avoid compiler warning.

        Orders list;

        if (src == ETH_TOKEN_ADDRESS) {
            list = buyList;
        } else {
            list = sellList;
        }

        uint32 orderId;
        OrderData memory orderData;

        (orderId, orderData.isLastOrder) = list.getFirstOrder();

        if (orderData.isLastOrder) return 0;

        uint128 remainingSrcAmount = uint128(totalSrcAmount);
        uint128 totalDstAmount = 0;

        orderData.isLastOrder = false;

        while (!orderData.isLastOrder) {

            (orderData.maker, orderData.nextId, orderData.isLastOrder, orderData.srcAmount, orderData.dstAmount) =
                list.getOrderData(orderId);

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

        //check overflow
        if (uint(totalDstAmount) * PRECISION < uint(totalDstAmount)) return 0;

        return calcRateFromQty(totalSrcAmount, totalDstAmount, getDecimals(src), getDecimals(dest));
//        return 100;
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

        conversionRate;
        validate;

        Orders list;

        if (srcToken == ETH_TOKEN_ADDRESS) {
            require(msg.value == srcAmount);
            list = buyList;
        } else {
            require(srcToken.transferFrom(msg.sender, this, srcAmount));
            require(msg.value == 0);
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
                list.getOrderData(orderId);

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

    event NewMakeOrder(uint32 orderId, address indexed maker, bool isEthToToken, uint128 srcAmount, uint128 dstAmount);

    function addMakeOrder(address maker, bool isEthToToken, uint128 srcAmount, uint128 dstAmount,
        uint32 hintPrevOrder) public returns(bool)
    {
        require(maker == msg.sender);
        require(validateOrder(maker, isEthToToken, srcAmount, dstAmount));

        Orders list;
        uint32 newID;
        if (isEthToToken) {
            list = buyList;
            newID = takeOrderId(makerOrdersBuy[maker]);
        } else {
            list = sellList;
            newID = takeOrderId(makerOrdersSell[maker]);
        }

        if (hintPrevOrder != 0) {

            list.addAfterId(maker, newID, srcAmount, dstAmount, hintPrevOrder);
        } else {

            if (isEthToToken) {
                list.add(maker, newID, srcAmount, dstAmount);
            } else {
                list.add(maker, newID, srcAmount, dstAmount);
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

        allocateOrders(
            makerOrdersSell[maker], /* freeOrders */
            sellList.allocateIds(numOrdersToAllocate), /* firstAllocatedId */
            numOrdersToAllocate /* howMany */
        );

        allocateOrders(
            makerOrdersBuy[maker], /* freeOrders */
            buyList.allocateIds(numOrdersToAllocate), /* firstAllocatedId */
            numOrdersToAllocate /* howMany */
        );
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
    function cancelOrder(uint32 orderId, bool isEthToToken) public returns(bool) {

        address maker = msg.sender;
        Orders list;

        if (isEthToToken) {
            list = buyList;
        } else {
            list = sellList;
        }

        OrderData memory orderData;

        (orderData.maker, orderData.nextId, orderData.isLastOrder, orderData.srcAmount, orderData.dstAmount) =
            list.getOrderData(orderId);

        require(orderData.maker == maker);

        uint weiAmount;

        if (isEthToToken) {
            weiAmount = orderData.srcAmount;
        } else {
            weiAmount = orderData.dstAmount;
        }

        require(handleOrderStakes(orderData.maker, calcKncStake(weiAmount), 0));

        // @dev: below can be done in two functions. no gas waste since handles different storage values.
        list.removeById(orderId);

        if (isEthToToken) {
            releaseOrderId(makerOrdersBuy[orderData.maker], orderId);
        } else {
            releaseOrderId(makerOrdersSell[orderData.maker], orderId);
        }

        OrderCanceled(maker, orderId, orderData.srcAmount, orderData.dstAmount);

        return true;
    }

    function setFeeBurner(FeeBurner burner) public {
        require(burner != address(0));

        kncToken.approve(feeBurnerContract, 0);

        feeBurnerContract = burner;

        kncToken.approve(feeBurnerContract, (2**255));
    }

    function getBuyOrderList() public view returns(uint32[] orderList) {

        Orders list = buyList;
        return getList(list);
    }

    function getSellOrderList() public view returns(uint32[] orderList) {

        Orders list = sellList;
        return getList(list);
    }

    function getList(Orders list) internal view returns(uint32[] orderList) {
        uint32 orderId;
        bool isEmpty;
        bool isLast = false;

        (orderId, isEmpty) = list.getFirstOrder();
        if (isEmpty) return(new uint32[](1));

        uint counter = 1;

        while (!isLast) {
            (orderId, isLast) = list.getNextOrder(orderId);
            counter++;
        }

        orderList = new uint32[](counter);

        (orderId, isEmpty) = list.getFirstOrder();

        counter = 0;
        orderList[counter++] = orderId;

        while (!isLast) {
            (orderId, isLast) = list.getNextOrder(orderId);
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

    function releaseOrderFunds(bool isEthToToken, Orders.Order order) internal returns(bool) {

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
        address maker,
        uint128 orderSrcAmount,
        uint128 orderDstAmount
    )
        internal
        returns (bool)
    {
        if (src == ETH_TOKEN_ADDRESS) {
            buyList.removeById(orderId);
        } else {
            sellList.removeById(orderId);
        }
        return takeOrder(maker, src, dest, orderSrcAmount, orderDstAmount);
    }

    function takePartialOrder(
        uint32 orderId,
        address maker,
        ERC20 src,
        ERC20 dest,
        uint128 srcAmount,
        uint128 dstAmount,
        uint128 orderSrcAmount,
        uint128 orderDstAmount
    )
        internal
        returns(bool)
    {
        require(srcAmount < orderSrcAmount);
        require(dstAmount < orderDstAmount);

        orderSrcAmount -= srcAmount;
        orderDstAmount -= dstAmount;

        Orders list;

        uint remainingWeiValue;
        if (src == ETH_TOKEN_ADDRESS) {
            remainingWeiValue = orderSrcAmount;
            list = buyList;
        } else {
            remainingWeiValue = orderDstAmount;
            list = sellList;
        }

        if (remainingWeiValue < minOrderValueWei) {
            // remaining order amount too small. remove order and add remaining funds to free funds
            makerFunds[maker][dest] += orderDstAmount;
            handleOrderStakes(maker, remainingWeiValue, 0);
            list.removeById(orderId);
        } else {
            // update order values in storage
            uint128 subDst = list.subSrcAndDstAmounts(orderId, srcAmount);
            require(subDst == orderDstAmount);
        }

        return(takeOrder(maker, src, dest, srcAmount, dstAmount));
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
}
