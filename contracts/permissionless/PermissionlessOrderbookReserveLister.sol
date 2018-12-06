pragma solidity 0.4.18;


import "./OrderbookReserve.sol";
import "../FeeBurnerInterface.sol";


contract InternalNetworkInterface {
    function addReserve(
        KyberReserveInterface reserve,
        bool isPermissionless
    )
        public
        returns(bool);

    function listPairForReserve(
        address reserve,
        ERC20 token,
        bool ethToToken,
        bool tokenToEth,
        bool add
    )
        public
        returns(bool);

    FeeBurnerInterface public feeBurnerContract;
}


contract PermissionlessOrderbookReserveLister {
    // KNC burn fee per wei value of an order. 25 in BPS = 0.25%.
    uint constant public ORDER_BOOK_BURN_FEE_BPS = 25;
    uint constant public MIN_NEW_ORDER_VALUE_DOLLAR = 1000;

    uint public maxOrdersPerTrade;

    InternalNetworkInterface public kyberNetworkContract;
    OrderFactoryInterface public orderFactoryContract;
    MedianizerInterface public medianizerContract;
    ERC20 public kncToken;

    enum ListingStage {NO_RESERVE, RESERVE_ADDED, RESERVE_INIT, RESERVE_LISTED}

    mapping(address => ListingStage) public reserveListingStage;
    mapping(address => OrderbookReserveInterface) public reserves;

    function PermissionlessOrderbookReserveLister(
        InternalNetworkInterface kyber,
        OrderFactoryInterface factory,
        MedianizerInterface medianizer,
        ERC20 knc,
        uint maxOrders
    )
        public
    {
        require(kyber != address(0));
        require(factory != address(0));
        require(medianizer != address(0));
        require(knc != address(0));
        require(maxOrders > 1);

        kyberNetworkContract = kyber;
        orderFactoryContract = factory;
        medianizerContract = medianizer;
        kncToken = knc;
        maxOrdersPerTrade = maxOrders;
    }

    event TokenOrderbookListingStage(ERC20 token, ListingStage stage);

    /// @dev anyone can call
    function addOrderbookContract(ERC20 token) public returns(bool) {
        require(reserveListingStage[token] == ListingStage.NO_RESERVE);
        require(token != kncToken);

        reserves[token] = new OrderbookReserve({
            knc: kncToken,
            reserveToken: token,
            burner: kyberNetworkContract.feeBurnerContract(),
            network: kyberNetworkContract,
            medianizer: medianizerContract,
            minNewOrderDollar: MIN_NEW_ORDER_VALUE_DOLLAR,
            maxOrdersPerTrade: maxOrdersPerTrade,
            burnFeeBps: ORDER_BOOK_BURN_FEE_BPS}
        );

        reserveListingStage[token] = ListingStage.RESERVE_ADDED;

        TokenOrderbookListingStage(token, ListingStage.RESERVE_ADDED);
        return true;
    }

    /// @dev anyone can call
    function initOrderbookContract(ERC20 token) public returns(bool) {
        require(reserveListingStage[token] == ListingStage.RESERVE_ADDED);
        require(reserves[token].init(orderFactoryContract));

        reserveListingStage[token] = ListingStage.RESERVE_INIT;
        TokenOrderbookListingStage(token, ListingStage.RESERVE_INIT);
        return true;
    }

    /// @dev anyone can call
    function listOrderbookContract(ERC20 token) public returns(bool) {
        require(reserveListingStage[token] == ListingStage.RESERVE_INIT);

        require(
            kyberNetworkContract.addReserve(
                KyberReserveInterface(reserves[token]),
                true
            )
        );

        require(
            kyberNetworkContract.listPairForReserve(
                KyberReserveInterface(reserves[token]),
                token,
                true,
                true,
                true
            )
        );

        FeeBurnerInterface feeBurner = FeeBurnerInterface(kyberNetworkContract.feeBurnerContract());

        feeBurner.setReserveData(
            reserves[token], /* reserve */
            ORDER_BOOK_BURN_FEE_BPS, /* fee */
            reserves[token] /* kncWallet */
        );

        reserveListingStage[token] = ListingStage.RESERVE_LISTED;
        TokenOrderbookListingStage(token, ListingStage.RESERVE_LISTED);
        return true;
    }

    /// @dev permission less reserve currently supports one token per reserve.
    function getOrderbookListingStage(ERC20 token)
        public
        view
        returns(address, ListingStage)
    {
        return (reserves[token], reserveListingStage[token]);
    }
}
