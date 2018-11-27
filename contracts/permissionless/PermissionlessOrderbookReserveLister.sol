pragma solidity 0.4.18;


import "./OrderbookReserve.sol";
import "./FeeBurnerResolverInterface.sol";
import "../FeeBurnerInterface.sol";


interface InternalNetworkInterface {
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
}


contract PermissionlessOrderbookReserveLister {
    InternalNetworkInterface public kyberNetworkContract;
    FeeBurnerResolverInterface public feeBurnerResolverContract;
    OrderFactoryInterface public ordersFactory;
    ERC20 public kncToken;

    enum ListingStage {NO_RESERVE, RESERVE_ADDED, RESERVE_INIT, RESERVE_LISTED}

    mapping(address => ListingStage) public reserveListingStage;
    mapping(address => OrderbookReserveInterface) public reserves;

    // KNC burn fee per wei value of an order. 25 in BPS = 0.25%.
    uint constant public ORDER_BOOK_BURN_FEE_BPS = 25;
    uint constant public MIN_ORDER_VALUE_WEI = 25 * 10 ** 17;                // Min Eth value for order to stay in list
    uint constant public MIN_NEW_ORDER_VALUE_WEI = 2 * MIN_ORDER_VALUE_WEI; // Min Eth value for a new order.

    function PermissionlessOrderbookReserveLister(
        InternalNetworkInterface kyber,
        FeeBurnerResolverInterface resolver,
        OrderFactoryInterface factory,
        ERC20 knc
    )
        public
    {
        require(kyber != address(0));
        require(resolver != address(0));
        require(factory != address(0));
        require(knc != address(0));

        kncToken = knc;
        kyberNetworkContract = kyber;
        feeBurnerResolverContract = resolver;
        ordersFactory = factory;
    }

    event TokenOrderbookListingStage(ERC20 token, ListingStage stage);

    /// @dev anyone can call
    function addOrderbookContract(ERC20 token) public returns(bool) {
        require(reserveListingStage[token] == ListingStage.NO_RESERVE);
        require(token != kncToken);

        reserves[token] = new OrderbookReserve(
            kncToken,
            token,
            feeBurnerResolverContract.getFeeBurnerAddress(),
            MIN_NEW_ORDER_VALUE_WEI,
            MIN_ORDER_VALUE_WEI,
            ORDER_BOOK_BURN_FEE_BPS
        );

        reserveListingStage[token] = ListingStage.RESERVE_ADDED;

        TokenOrderbookListingStage(token, ListingStage.RESERVE_ADDED);
        return true;
    }

    /// @dev anyone can call
    function initOrderbookContract(ERC20 token) public returns(bool) {
        require(reserveListingStage[token] == ListingStage.RESERVE_ADDED);
        require(reserves[token].init(ordersFactory));

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

        FeeBurnerInterface feeBurner = FeeBurnerInterface(
            feeBurnerResolverContract.getFeeBurnerAddress()
        );
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
