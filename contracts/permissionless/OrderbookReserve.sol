pragma solidity 0.4.18;


import "./OrderListInterface.sol";
import "./OrderIdManager.sol";
import "./OrderbookReserveInterface.sol";
import "../Utils2.sol";
import "../KyberReserveInterface.sol";


contract FeeBurnerRateInterface {
    uint public kncPerEthRatePrecision;
}


interface MedianizerInterface {
    function peek() public view returns (bytes32, bool);
}


contract OrderbookReserve is OrderIdManager, Utils2, KyberReserveInterface, OrderbookReserveInterface {

    uint public constant BURN_TO_STAKE_FACTOR = 5;      // stake per order must be xfactor expected burn amount.
    uint public constant MAX_BURN_FEE_BPS = 100;        // 1%
    uint public constant MIN_REMAINING_ORDER_RATIO = 2; // Ratio between min new order value and min order value.
    uint public constant MAX_USD_PER_ETH = 100000;      // Above this value price is surely compromised.

    uint32 constant public TAIL_ID = 1;         // tail Id in order list contract
    uint32 constant public HEAD_ID = 2;         // head Id in order list contract

    struct OrderLimits {
        uint minNewOrderSizeUsd; // Basis for setting min new order size Eth
        uint maxOrdersPerTrade;     // Limit number of iterated orders per trade / getRate loops.
        uint minNewOrderSizeWei;    // Below this value can't create new order.
        uint minOrderSizeWei;       // below this value order will be removed.
    }

    uint public kncPerEthBaseRatePrecision; // according to base rate all stakes are calculated.

    struct ExternalContracts {
        ERC20 kncToken;          // not constant. to enable testing while not on main net
        ERC20 token;             // only supported token.
        FeeBurnerRateInterface feeBurner;
        address kyberNetwork;
        MedianizerInterface medianizer; // price feed Eth - USD from maker DAO.
        OrderListFactoryInterface orderListFactory;
    }

    //struct for getOrderData() return value. used only in memory.
    struct OrderData {
        address maker;
        uint32 nextId;
        bool isLastOrder;
        uint128 srcAmount;
        uint128 dstAmount;
    }

    OrderLimits public limits;
    ExternalContracts public contracts;

    // sorted lists of orders. one list for token to Eth, other for Eth to token.
    // Each order is added in the correct position in the list to keep it sorted.
    OrderListInterface public tokenToEthList;
    OrderListInterface public ethToTokenList;

    //funds data
    mapping(address => mapping(address => uint)) public makerFunds; // deposited maker funds.
    mapping(address => uint) public makerKnc;            // for knc staking.
    mapping(address => uint) public makerTotalOrdersWei; // per maker how many Wei in orders, for stake calculation.

    uint public makerBurnFeeBps;    // knc burn fee per order that is taken.

    //each maker will have orders that will be reused.
    mapping(address => OrderIdData) public makerOrdersTokenToEth;
    mapping(address => OrderIdData) public makerOrdersEthToToken;

    function OrderbookReserve(
        ERC20 knc,
        ERC20 reserveToken,
        address burner,
        address network,
        MedianizerInterface medianizer,
        OrderListFactoryInterface factory,
        uint minNewOrderUsd,
        uint maxOrdersPerTrade,
        uint burnFeeBps
    )
        public
    {

        require(knc != address(0));
        require(reserveToken != address(0));
        require(burner != address(0));
        require(network != address(0));
        require(medianizer != address(0));
        require(factory != address(0));
        require(burnFeeBps != 0);
        require(burnFeeBps <= MAX_BURN_FEE_BPS);
        require(maxOrdersPerTrade != 0);
        require(minNewOrderUsd > 0);

        contracts.kyberNetwork = network;
        contracts.feeBurner = FeeBurnerRateInterface(burner);
        contracts.medianizer = medianizer;
        contracts.orderListFactory = factory;
        contracts.kncToken = knc;
        contracts.token = reserveToken;

        makerBurnFeeBps = burnFeeBps;
        limits.minNewOrderSizeUsd = minNewOrderUsd;
        limits.maxOrdersPerTrade = maxOrdersPerTrade;

        require(setMinOrderSizeEth());
    
        require(contracts.kncToken.approve(contracts.feeBurner, (2**255)));

        //can only support tokens with decimals() API
        setDecimals(contracts.token);

        kncPerEthBaseRatePrecision = contracts.feeBurner.kncPerEthRatePrecision();
    }

    ///@dev separate init function for this contract, if this init is in the C'tor. gas consumption too high.
    function init() public returns(bool) {
        if ((tokenToEthList != address(0)) && (ethToTokenList != address(0))) return true;
        if ((tokenToEthList != address(0)) || (ethToTokenList != address(0))) revert();

        tokenToEthList = contracts.orderListFactory.newOrdersContract(this);
        ethToTokenList = contracts.orderListFactory.newOrdersContract(this);

        return true;
    }

    function setKncPerEthBaseRate() public {
        uint kncPerEthRatePrecision = contracts.feeBurner.kncPerEthRatePrecision();
        if (kncPerEthRatePrecision < kncPerEthBaseRatePrecision) {
            kncPerEthBaseRatePrecision = kncPerEthRatePrecision;
        }
    }

    function getConversionRate(ERC20 src, ERC20 dst, uint srcQty, uint blockNumber) public view returns(uint) {
        require((src == ETH_TOKEN_ADDRESS) || (dst == ETH_TOKEN_ADDRESS));
        require((src == contracts.token) || (dst == contracts.token));
        require(srcQty <= MAX_QTY);

        if (kncRateBlocksTrade()) return 0;

        blockNumber; // in this reserve no order expiry == no use for blockNumber. here to avoid compiler warning.

        //user order ETH -> token is matched with maker order token -> ETH
        OrderListInterface list = (src == ETH_TOKEN_ADDRESS) ? tokenToEthList : ethToTokenList;

        uint32 orderId;
        OrderData memory orderData;

        uint128 userRemainingSrcQty = uint128(srcQty);
        uint128 totalUserDstAmount = 0;
        uint maxOrders = limits.maxOrdersPerTrade;

        for (
            (orderId, orderData.isLastOrder) = list.getFirstOrder();
            ((userRemainingSrcQty > 0) && (!orderData.isLastOrder) && (maxOrders-- > 0));
            orderId = orderData.nextId
        ) {
            orderData = getOrderData(list, orderId);
            // maker dst quantity is the requested quantity he wants to receive. user src quantity is what user gives.
            // so user src quantity is matched with maker dst quantity
            if (orderData.dstAmount <= userRemainingSrcQty) {
                totalUserDstAmount += orderData.srcAmount;
                userRemainingSrcQty -= orderData.dstAmount;
            } else {
                totalUserDstAmount += uint128(uint(orderData.srcAmount) * uint(userRemainingSrcQty) /
                    uint(orderData.dstAmount));
                userRemainingSrcQty = 0;
            }
        }

        if (userRemainingSrcQty != 0) return 0; //not enough tokens to exchange.

        return calcRateFromQty(srcQty, totalUserDstAmount, getDecimals(src), getDecimals(dst));
    }

    event OrderbookReserveTrade(ERC20 srcToken, ERC20 dstToken, uint srcAmount, uint dstAmount);

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
        require(msg.sender == contracts.kyberNetwork);
        require((srcToken == ETH_TOKEN_ADDRESS) || (dstToken == ETH_TOKEN_ADDRESS));
        require((srcToken == contracts.token) || (dstToken == contracts.token));
        require(srcAmount <= MAX_QTY);

        conversionRate;
        validate;

        if (srcToken == ETH_TOKEN_ADDRESS) {
            require(msg.value == srcAmount);
        } else {
            require(msg.value == 0);
            require(srcToken.transferFrom(msg.sender, this, srcAmount));
        }

        uint totalDstAmount = doTrade(
                srcToken,
                srcAmount,
                dstToken
            );

        require(conversionRate <= calcRateFromQty(srcAmount, totalDstAmount, getDecimals(srcToken),
            getDecimals(dstToken)));

        //all orders were successfully taken. send to dstAddress
        if (dstToken == ETH_TOKEN_ADDRESS) {
            dstAddress.transfer(totalDstAmount);
        } else {
            require(dstToken.transfer(dstAddress, totalDstAmount));
        }

        OrderbookReserveTrade(srcToken, dstToken, srcAmount, totalDstAmount);
        return true;
    }

    function doTrade(
        ERC20 srcToken,
        uint srcAmount,
        ERC20 dstToken
    )
        internal
        returns(uint)
    {
        OrderListInterface list = (srcToken == ETH_TOKEN_ADDRESS) ? tokenToEthList : ethToTokenList;

        uint32 orderId;
        OrderData memory orderData;
        uint128 userRemainingSrcQty = uint128(srcAmount);
        uint128 totalUserDstAmount = 0;

        for (
            (orderId, orderData.isLastOrder) = list.getFirstOrder();
            ((userRemainingSrcQty > 0) && (!orderData.isLastOrder));
            orderId = orderData.nextId
        ) {
        // maker dst quantity is the requested quantity he wants to receive. user src quantity is what user gives.
        // so user src quantity is matched with maker dst quantity
            orderData = getOrderData(list, orderId);
            if (orderData.dstAmount <= userRemainingSrcQty) {
                totalUserDstAmount += orderData.srcAmount;
                userRemainingSrcQty -= orderData.dstAmount;
                require(takeFullOrder({
                    maker: orderData.maker,
                    orderId: orderId,
                    userSrc: srcToken,
                    userDst: dstToken,
                    userSrcAmount: orderData.dstAmount,
                    userDstAmount: orderData.srcAmount
                }));
            } else {
                uint128 partialDstQty = uint128(uint(orderData.srcAmount) * uint(userRemainingSrcQty) /
                    uint(orderData.dstAmount));
                totalUserDstAmount += partialDstQty;
                require(takePartialOrder({
                    maker: orderData.maker,
                    orderId: orderId,
                    userSrc: srcToken,
                    userDst: dstToken,
                    userPartialSrcAmount: userRemainingSrcQty,
                    userTakeDstAmount: partialDstQty,
                    orderSrcAmount: orderData.srcAmount,
                    orderDstAmount: orderData.dstAmount
                }));
                userRemainingSrcQty = 0;
            }
        }

        require(userRemainingSrcQty == 0 && totalUserDstAmount > 0);

        return totalUserDstAmount;
    }

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
        uint32 newId = fetchNewOrderId(makerOrdersTokenToEth[msg.sender]);
        return addOrder(false, newId, srcAmount, dstAmount, hintPrevOrder);
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
        uint32 newId = fetchNewOrderId(makerOrdersEthToToken[msg.sender]);
        return addOrder(true, newId, srcAmount, dstAmount, hintPrevOrder);
    }

    ///@dev notice here a batch of orders represented in arrays. order x is represented by x cells of all arrays.
    ///@dev all arrays expected to the same length.
    ///@param isEthToToken per each order. is order x eth to token (= src is Eth) or vice versa.
    ///@param srcAmount per each order. source amount for order x.
    ///@param dstAmount per each order. destination amount for order x.
    ///@param hintPrevOrder per each order what is the order it should be added after in ordered list. 0 for no hint.
    ///@param isAfterPrevOrder per each order, set true if should be added in list right after previous added order.
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
            newId = fetchNewOrderId(isEthToToken[i] ? makerOrdersEthToToken[maker] : makerOrdersTokenToEth[maker]);
            require(addOrder(isEthToToken[i], newId, srcAmount[i], dstAmount[i], prevId));
        }

        return true;
    }

    function updateTokenToEthOrder(uint32 orderId, uint128 newSrcAmount, uint128 newDstAmount)
        public
        returns(bool)
    {
        require(updateTokenToEthOrderWHint(orderId, newSrcAmount, newDstAmount, 0));
        return true;
    }

    function updateTokenToEthOrderWHint(
        uint32 orderId,
        uint128 newSrcAmount,
        uint128 newDstAmount,
        uint32 hintPrevOrder
    )
        public
        returns(bool)
    {
        require(updateOrder(false, orderId, newSrcAmount, newDstAmount, hintPrevOrder));
        return true;
    }

    function updateEthToTokenOrder(uint32 orderId, uint128 newSrcAmount, uint128 newDstAmount)
        public
        returns(bool)
    {
        return updateEthToTokenOrderWHint(orderId, newSrcAmount, newDstAmount, 0);
    }

    function updateEthToTokenOrderWHint(
        uint32 orderId,
        uint128 newSrcAmount,
        uint128 newDstAmount,
        uint32 hintPrevOrder
    )
        public
        returns(bool)
    {
        require(updateOrder(true, orderId, newSrcAmount, newDstAmount, hintPrevOrder));
        return true;
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

        for (uint i = 0; i < isEthToToken.length; ++i) {
            require(updateOrder(isEthToToken[i], orderId[i], newSrcAmount[i], newDstAmount[i],
                hintPrevOrder[i]));
        }

        return true;
    }

    event TokenDeposited(address indexed maker, uint amount);

    function depositToken(address maker, uint amount) public {
        require(maker != address(0));
        require(amount < MAX_QTY);

        require(contracts.token.transferFrom(msg.sender, this, amount));

        makerFunds[maker][contracts.token] += amount;
        TokenDeposited(maker, amount);
    }

    event EtherDeposited(address indexed maker, uint amount);

    function depositEther(address maker) public payable {
        require(maker != address(0));

        makerFunds[maker][ETH_TOKEN_ADDRESS] += msg.value;
        EtherDeposited(maker, msg.value);
    }

    event KncFeeDeposited(address indexed maker, uint amount);

    // knc will be staked per order. part of the amount will be used as fee.
    function depositKncForFee(address maker, uint amount) public {
        require(maker != address(0));
        require(amount < MAX_QTY);

        require(contracts.kncToken.transferFrom(msg.sender, this, amount));

        makerKnc[maker] += amount;

        KncFeeDeposited(maker, amount);

        if (orderAllocationRequired(makerOrdersTokenToEth[maker])) {
            require(allocateOrderIds(
                makerOrdersTokenToEth[maker], /* makerOrders */
                tokenToEthList.allocateIds(uint32(NUM_ORDERS)) /* firstAllocatedId */
            ));
        }

        if (orderAllocationRequired(makerOrdersEthToToken[maker])) {
            require(allocateOrderIds(
                makerOrdersEthToToken[maker], /* makerOrders */
                ethToTokenList.allocateIds(uint32(NUM_ORDERS)) /* firstAllocatedId */
            ));
        }
    }

    function withdrawToken(uint amount) public {

        address maker = msg.sender;
        uint makerFreeAmount = makerFunds[maker][contracts.token];

        require(makerFreeAmount >= amount);

        makerFunds[maker][contracts.token] -= amount;

        require(contracts.token.transfer(maker, amount));
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
        
        require(makerKnc[maker] >= amount);
        require(makerUnlockedKnc(maker) >= amount);

        makerKnc[maker] -= amount;

        require(contracts.kncToken.transfer(maker, amount));
    }

    function cancelTokenToEthOrder(uint32 orderId) public returns(bool) {
        require(cancelOrder(false, orderId));
        return true;
    }

    function cancelEthToTokenOrder(uint32 orderId) public returns(bool) {
        require(cancelOrder(true, orderId));
        return true;
    }

    function setMinOrderSizeEth() public returns(bool) {
        //get eth to $ from maker dao;
        bytes32 usdPerEthInWei;
        bool valid;
        (usdPerEthInWei, valid) = contracts.medianizer.peek();
        require(valid);

        // ensuring that there is no underflow or overflow possible,
        // even if the price is compromised
        uint usdPerEth = uint(usdPerEthInWei) / (1 ether);
        require(usdPerEth != 0);
        require(usdPerEth < MAX_USD_PER_ETH);

        // set Eth order limits according to price
        uint minNewOrderSizeWei = limits.minNewOrderSizeUsd * PRECISION * (1 ether) / uint(usdPerEthInWei);

        limits.minNewOrderSizeWei = minNewOrderSizeWei;
        limits.minOrderSizeWei = limits.minNewOrderSizeWei / MIN_REMAINING_ORDER_RATIO;

        return true;
    }

    ///@dev Each maker stakes per order KNC that is factor of the required burn amount.
    ///@dev If Knc per Eth rate becomes lower by more then factor, stake will not be enough and trade will be blocked.
    function kncRateBlocksTrade() public view returns (bool) {
        return (contracts.feeBurner.kncPerEthRatePrecision() > kncPerEthBaseRatePrecision * BURN_TO_STAKE_FACTOR);
    }

    function getTokenToEthAddOrderHint(uint128 srcAmount, uint128 dstAmount) public view returns (uint32) {
        require(dstAmount >= limits.minNewOrderSizeWei);
        return tokenToEthList.findPrevOrderId(srcAmount, dstAmount);
    }

    function getEthToTokenAddOrderHint(uint128 srcAmount, uint128 dstAmount) public view returns (uint32) {
        require(srcAmount >= limits.minNewOrderSizeWei);
        return ethToTokenList.findPrevOrderId(srcAmount, dstAmount);
    }

    function getTokenToEthUpdateOrderHint(uint32 orderId, uint128 srcAmount, uint128 dstAmount)
        public
        view
        returns (uint32)
    {
        require(dstAmount >= limits.minNewOrderSizeWei);
        uint32 prevId = tokenToEthList.findPrevOrderId(srcAmount, dstAmount);
        address add;
        uint128 noUse;
        uint32 next;

        if (prevId == orderId) {
            (add, noUse, noUse, prevId, next) = tokenToEthList.getOrderDetails(orderId);
        }

        return prevId;
    }

    function getEthToTokenUpdateOrderHint(uint32 orderId, uint128 srcAmount, uint128 dstAmount)
        public
        view
        returns (uint32)
    {
        require(srcAmount >= limits.minNewOrderSizeWei);
        uint32 prevId = ethToTokenList.findPrevOrderId(srcAmount, dstAmount);
        address add;
        uint128 noUse;
        uint32 next;

        if (prevId == orderId) {
            (add, noUse, noUse, prevId, next) = ethToTokenList.getOrderDetails(orderId);
        }

        return prevId;
    }

    function getTokenToEthOrder(uint32 orderId)
        public view
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

    function getEthToTokenOrder(uint32 orderId)
        public view
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

    function makerRequiredKncStake(address maker) public view returns (uint) {
        return(calcKncStake(makerTotalOrdersWei[maker]));
    }

    function makerUnlockedKnc(address maker) public view returns (uint) {
        uint requiredKncStake = makerRequiredKncStake(maker);
        if (requiredKncStake > makerKnc[maker]) return 0;
        return (makerKnc[maker] - requiredKncStake);
    }

    function calcKncStake(uint weiAmount) public view returns(uint) {
        return(calcBurnAmount(weiAmount) * BURN_TO_STAKE_FACTOR);
    }

    function calcBurnAmount(uint weiAmount) public view returns(uint) {
        return(weiAmount * makerBurnFeeBps * kncPerEthBaseRatePrecision / (10000 * PRECISION));
    }

    function calcBurnAmountFromFeeBurner(uint weiAmount) public view returns(uint) {
        return(weiAmount * makerBurnFeeBps * contracts.feeBurner.kncPerEthRatePrecision() / (10000 * PRECISION));
    }

    ///@dev This function is not fully optimized gas wise. Consider before calling on chain.
    function getEthToTokenMakerOrderIds(address maker) public view returns(uint32[] orderList) {
        OrderIdData storage makerOrders = makerOrdersEthToToken[maker];
        orderList = new uint32[](getNumActiveOrderIds(makerOrders));
        uint activeOrder = 0;

        for (uint32 i = 0; i < NUM_ORDERS; ++i) {
            if ((makerOrders.takenBitmap & (uint(1) << i) > 0)) orderList[activeOrder++] = makerOrders.firstOrderId + i;
        }
    }

    ///@dev This function is not fully optimized gas wise. Consider before calling on chain.
    function getTokenToEthMakerOrderIds(address maker) public view returns(uint32[] orderList) {
        OrderIdData storage makerOrders = makerOrdersTokenToEth[maker];
        orderList = new uint32[](getNumActiveOrderIds(makerOrders));
        uint activeOrder = 0;

        for (uint32 i = 0; i < NUM_ORDERS; ++i) {
            if ((makerOrders.takenBitmap & (uint(1) << i) > 0)) orderList[activeOrder++] = makerOrders.firstOrderId + i;
        }
    }

    ///@dev This function is not fully optimized gas wise. Consider before calling on chain.
    function getEthToTokenOrderList() public view returns(uint32[] orderList) {
        OrderListInterface list = ethToTokenList;
        return getList(list);
    }

    ///@dev This function is not fully optimized gas wise. Consider before calling on chain.
    function getTokenToEthOrderList() public view returns(uint32[] orderList) {
        OrderListInterface list = tokenToEthList;
        return getList(list);
    }

    event NewLimitOrder(
        address indexed maker,
        uint32 orderId,
        bool isEthToToken,
        uint128 srcAmount,
        uint128 dstAmount,
        bool addedWithHint
    );

    function addOrder(bool isEthToToken, uint32 newId, uint128 srcAmount, uint128 dstAmount, uint32 hintPrevOrder)
        internal
        returns(bool)
    {
        require(srcAmount < MAX_QTY);
        require(dstAmount < MAX_QTY);
        address maker = msg.sender;

        require(secureAddOrderFunds(maker, isEthToToken, srcAmount, dstAmount));
        require(validateLegalRate(srcAmount, dstAmount, isEthToToken));

        bool addedWithHint = false;
        OrderListInterface list = isEthToToken ? ethToTokenList : tokenToEthList;

        if (hintPrevOrder != 0) {
            addedWithHint = list.addAfterId(maker, newId, srcAmount, dstAmount, hintPrevOrder);
        }

        if (!addedWithHint) {
            require(list.add(maker, newId, srcAmount, dstAmount));
        }

        NewLimitOrder(maker, newId, isEthToToken, srcAmount, dstAmount, addedWithHint);

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

    function updateOrder(bool isEthToToken, uint32 orderId, uint128 newSrcAmount,
        uint128 newDstAmount, uint32 hintPrevOrder)
        internal
        returns(bool)
    {
        require(newSrcAmount < MAX_QTY);
        require(newDstAmount < MAX_QTY);
        address maker;
        uint128 currDstAmount;
        uint128 currSrcAmount;
        uint32 noUse;
        uint noUse2;

        require(validateLegalRate(newSrcAmount, newDstAmount, isEthToToken));

        OrderListInterface list = isEthToToken ? ethToTokenList : tokenToEthList;

        (maker, currSrcAmount, currDstAmount, noUse, noUse) = list.getOrderDetails(orderId);
        require(maker == msg.sender);

        if (!secureUpdateOrderFunds(maker, isEthToToken, currSrcAmount, currDstAmount, newSrcAmount, newDstAmount)) {
            return false;
        }

        bool updatedWithHint = false;

        if (hintPrevOrder != 0) {
            (updatedWithHint, noUse2) = list.updateWithPositionHint(orderId, newSrcAmount, newDstAmount, hintPrevOrder);
        }

        if (!updatedWithHint) {
            require(list.update(orderId, newSrcAmount, newDstAmount));
        }

        OrderUpdated(maker, isEthToToken, orderId, newSrcAmount, newDstAmount, updatedWithHint);

        return true;
    }

    event OrderCanceled(address indexed maker, bool isEthToToken, uint32 orderId, uint128 srcAmount, uint dstAmount);

    function cancelOrder(bool isEthToToken, uint32 orderId) internal returns(bool) {

        address maker = msg.sender;
        OrderListInterface list = isEthToToken ? ethToTokenList : tokenToEthList;
        OrderData memory orderData = getOrderData(list, orderId);

        require(orderData.maker == maker);

        uint weiAmount = isEthToToken ? orderData.srcAmount : orderData.dstAmount;
        require(releaseOrderStakes(maker, weiAmount, 0));

        require(removeOrder(list, maker, isEthToToken ? ETH_TOKEN_ADDRESS : contracts.token, orderId));

        //funds go back to makers account
        makerFunds[maker][isEthToToken ? ETH_TOKEN_ADDRESS : contracts.token] += orderData.srcAmount;

        OrderCanceled(maker, isEthToToken, orderId, orderData.srcAmount, orderData.dstAmount);

        return true;
    }

    ///@param maker is the maker of this order
    ///@param isEthToToken which order type the maker is updating / adding
    ///@param srcAmount is the orders src amount (token or ETH) could be negative if funds are released.
    function bindOrderFunds(address maker, bool isEthToToken, int srcAmount)
        internal
        returns(bool)
    {
        address fundsAddress = isEthToToken ? ETH_TOKEN_ADDRESS : contracts.token;

        if (srcAmount < 0) {
            makerFunds[maker][fundsAddress] += uint(-srcAmount);
        } else {
            require(makerFunds[maker][fundsAddress] >= uint(srcAmount));
            makerFunds[maker][fundsAddress] -= uint(srcAmount);
        }

        return true;
    }

    ///@param maker is the maker address
    ///@param weiAmount is the wei amount inside order that should result in knc staking
    function bindOrderStakes(address maker, int weiAmount) internal returns(bool) {

        if (weiAmount < 0) {
            uint decreaseWeiAmount = uint(-weiAmount);
            if (decreaseWeiAmount > makerTotalOrdersWei[maker]) decreaseWeiAmount = makerTotalOrdersWei[maker];
            makerTotalOrdersWei[maker] -= decreaseWeiAmount;
            return true;
        }

        require(makerKnc[maker] >= calcKncStake(makerTotalOrdersWei[maker] + uint(weiAmount)));

        makerTotalOrdersWei[maker] += uint(weiAmount);

        return true;
    }

    ///@dev if totalWeiAmount is 0 we only release stakes.
    ///@dev if totalWeiAmount == weiForBurn. all staked amount will be burned. so no knc returned to maker
    ///@param maker is the maker address
    ///@param totalWeiAmount is total wei amount that was released from order - including taken wei amount.
    ///@param weiForBurn is the part in order wei amount that was taken and should result in burning.
    function releaseOrderStakes(address maker, uint totalWeiAmount, uint weiForBurn) internal returns(bool) {

        require(weiForBurn <= totalWeiAmount);

        if (totalWeiAmount > makerTotalOrdersWei[maker]) {
            makerTotalOrdersWei[maker] = 0;
        } else {
            makerTotalOrdersWei[maker] -= totalWeiAmount;
        }

        if (weiForBurn == 0) return true;

        uint burnAmount = calcBurnAmountFromFeeBurner(weiForBurn);

        require(makerKnc[maker] >= burnAmount);
        makerKnc[maker] -= burnAmount;

        return true;
    }

    ///@dev funds are valid only when required knc amount can be staked for this order.
    function secureAddOrderFunds(address maker, bool isEthToToken, uint128 srcAmount, uint128 dstAmount)
        internal returns(bool)
    {
        uint weiAmount = isEthToToken ? srcAmount : dstAmount;

        require(weiAmount >= limits.minNewOrderSizeWei);
        require(bindOrderFunds(maker, isEthToToken, int(srcAmount)));
        require(bindOrderStakes(maker, int(weiAmount)));

        return true;
    }

    ///@dev funds are valid only when required knc amount can be staked for this order.
    function secureUpdateOrderFunds(address maker, bool isEthToToken, uint128 prevSrcAmount, uint128 prevDstAmount,
        uint128 newSrcAmount, uint128 newDstAmount)
        internal
        returns(bool)
    {
        uint weiAmount = isEthToToken ? newSrcAmount : newDstAmount;
        int weiDiff = isEthToToken ? (int(newSrcAmount) - int(prevSrcAmount)) :
            (int(newDstAmount) - int(prevDstAmount));

        require(weiAmount >= limits.minNewOrderSizeWei);

        require(bindOrderFunds(maker, isEthToToken, int(newSrcAmount) - int(prevSrcAmount)));

        require(bindOrderStakes(maker, weiDiff));

        return true;
    }

    event FullOrderTaken(address maker, uint32 orderId, bool isEthToToken);

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
        OrderListInterface list = (userSrc == ETH_TOKEN_ADDRESS) ? tokenToEthList : ethToTokenList;

        //userDst == maker source
        require(removeOrder(list, maker, userDst, orderId));

        FullOrderTaken(maker, orderId, userSrc == ETH_TOKEN_ADDRESS);

        return takeOrder(maker, userSrc, userSrcAmount, userDstAmount, 0);
    }

    event PartialOrderTaken(address maker, uint32 orderId, bool isEthToToken, bool isRemoved);

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

        //must reuse parameters, otherwise stack too deep error.
        orderSrcAmount -= userTakeDstAmount;
        orderDstAmount -= userPartialSrcAmount;

        OrderListInterface list = (userSrc == ETH_TOKEN_ADDRESS) ? tokenToEthList : ethToTokenList;
        uint weiValueNotReleasedFromOrder = (userSrc == ETH_TOKEN_ADDRESS) ? orderDstAmount : orderSrcAmount;
        uint additionalReleasedWei = 0;

        if (weiValueNotReleasedFromOrder < limits.minOrderSizeWei) {
            // remaining order amount too small. remove order and add remaining funds to free funds
            makerFunds[maker][userDst] += orderSrcAmount;
            additionalReleasedWei = weiValueNotReleasedFromOrder;

            //for remove order we give makerSrc == userDst
            require(removeOrder(list, maker, userDst, orderId));
        } else {
            bool isSuccess;

            // update order values, taken order is always first order
            (isSuccess,) = list.updateWithPositionHint(orderId, orderSrcAmount, orderDstAmount, HEAD_ID);
            require(isSuccess);
        }

        PartialOrderTaken(maker, orderId, userSrc == ETH_TOKEN_ADDRESS, additionalReleasedWei > 0);

        //stakes are returned for unused wei value
        return(takeOrder(maker, userSrc, userPartialSrcAmount, userTakeDstAmount, additionalReleasedWei));
    }
    
    function takeOrder(
        address maker,
        ERC20 userSrc,
        uint userSrcAmount,
        uint userDstAmount,
        uint additionalReleasedWei
    )
        internal
        returns(bool)
    {
        uint weiAmount = userSrc == (ETH_TOKEN_ADDRESS) ? userSrcAmount : userDstAmount;

        //token / eth already collected. just update maker balance
        makerFunds[maker][userSrc] += userSrcAmount;

        // send dst tokens in one batch. not here
        //handle knc stakes and fee. releasedWeiValue was released and not traded.
        return releaseOrderStakes(maker, (weiAmount + additionalReleasedWei), weiAmount);
    }

    function removeOrder(
        OrderListInterface list,
        address maker,
        ERC20 makerSrc,
        uint32 orderId
    )
        internal returns(bool)
    {
        require(list.remove(orderId));
        OrderIdData storage orders = (makerSrc == ETH_TOKEN_ADDRESS) ?
            makerOrdersEthToToken[maker] : makerOrdersTokenToEth[maker];
        require(releaseOrderId(orders, orderId));

        return true;
    }

    function getList(OrderListInterface list) internal view returns(uint32[] memory orderList) {
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

    function getOrderData(OrderListInterface list, uint32 orderId) internal view returns (OrderData data) {
        uint32 prevId;
        (data.maker, data.srcAmount, data.dstAmount, prevId, data.nextId) = list.getOrderDetails(orderId);
        data.isLastOrder = (data.nextId == TAIL_ID);
    }

    function validateLegalRate (uint srcAmount, uint dstAmount, bool isEthToToken)
        internal view returns(bool)
    {
        uint rate;

        /// notice, rate is calculated from taker perspective,
        ///     for taker amounts are opposite. order srcAmount will be DstAmount for taker.
        if (isEthToToken) {
            rate = calcRateFromQty(dstAmount, srcAmount, getDecimals(contracts.token), ETH_DECIMALS);
        } else {
            rate = calcRateFromQty(dstAmount, srcAmount, ETH_DECIMALS, getDecimals(contracts.token));
        }

        if (rate > MAX_RATE) return false;
        return true;
    }
}
