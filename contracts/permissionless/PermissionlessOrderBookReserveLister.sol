pragma solidity 0.4.18;


import "./OrderBookReserve.sol";
import "../FeeBurnerInterface.sol";


interface InternalNetworkInterface {
    function addReserve(
        KyberReserveInterface reserve,
        bool add,
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


contract PermissionlessOrderBookReserveLister {
    InternalNetworkInterface public kyberNetworkContract;
    FeeBurnerResolverInterface public feeBurnerResolverContract;
    OrdersFactoryInterface public ordersFactory;
    ERC20 public kncToken;

    enum ListingStage {NO_RESERVE, RESERVE_ADDED, RESERVE_INIT, RESERVE_LISTED}

    mapping(address => ListingStage) public reserveListingStage;
    mapping(address => OrderBookReserveInterface) public reserves;

    // KNC burn fee per order that is taken. = 25 / 1000 = 0.25 %
    // TODO: pass this to OrderBookReserve's ctor
    uint constant public ORDER_BOOK_BURN_FEE_BPS = 25;

    function PermissionlessOrderBookReserveLister(
        InternalNetworkInterface kyber,
        FeeBurnerResolverInterface resolver,
        OrdersFactoryInterface factory,
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

    event TokenOrderBookListingStage(ERC20 token, ListingStage stage);
    /// @dev anyone can call
    function addOrderBookContract(ERC20 token) public returns(bool) {
        require(reserveListingStage[token] == ListingStage.NO_RESERVE);
        require(token != kncToken);

        reserves[token] = new OrderBookReserve(
            kncToken,
            token,
            feeBurnerResolverContract,
            ordersFactory
        );
        reserveListingStage[token] = ListingStage.RESERVE_ADDED;

        TokenOrderBookListingStage(token, ListingStage.RESERVE_ADDED);
        return true;
    }

    /// @dev anyone can call
    function initOrderBookContract(ERC20 token) public returns(bool) {
        require(reserveListingStage[token] == ListingStage.RESERVE_ADDED);
        require(reserves[token].init());

        reserveListingStage[token] = ListingStage.RESERVE_INIT;
        TokenOrderBookListingStage(token, ListingStage.RESERVE_INIT);
        return true;
    }

    /// @dev anyone can call
    function listOrderBookContract(ERC20 token) public returns(bool) {
        require(reserveListingStage[token] == ListingStage.RESERVE_INIT);

        require(
            kyberNetworkContract.addReserve(
                KyberReserveInterface(reserves[token]),
                true,
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
        TokenOrderBookListingStage(token, ListingStage.RESERVE_LISTED);
        return true;
    }

    /// @dev permission less reserve currently supports one token per reserve.
    function getOrderBookContractState(ERC20 token)
        public
        view
        returns(address, ListingStage)
    {
        return (reserves[token], reserveListingStage[token]);
    }
}
