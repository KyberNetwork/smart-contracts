pragma solidity 0.4.18;


import "./OrderBookReserve.sol";
import "../FeeBurnerInterface.sol";
//import "../KyberNetworkInterface.sol";


contract KyberNetworkInterface {
    function feeBurnerContract() public view returns(FeeBurnerInterface);
    function addReserve(KyberReserveInterface reserve, bool add, bool isPermissionless) public;
    function listPairForReserve(address reserve, ERC20 token, bool ethToToken, bool tokenToEth, bool add) public;
    function reservesPerTokenSrc(address, uint) public view returns(address);
    function reservesPerTokenDest(address, uint) public view returns(address);
}


contract PermissionlessOrderBookReserveLister {

    bytes32 public orderBookCodeSha3;

    KyberNetworkInterface public kyberNetworkContract;
    FeeBurnerResolverInterface public feeBurnerResolverContract;
    OrdersFactoryInterface public ordersFactory;
    ERC20 public kncToken;

    enum ListingStage {NO_RESERVE, RESERVE_ADDED, RESERVE_INIT, RESERVE_LISTED}

    mapping(address => ListingStage) public reserveListingStage;
    mapping(address => OrderBookReserveInterface) public reserves;

    function PermissionlessOrderBookReserveLister(
        KyberNetworkInterface kyber,
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

//    function init() public {
//        OrderBookReserveInterface reserve =
//            new OrderBookReserve(kncToken, kncToken, feeBurnerResolverContract, ordersFactory);
//        reserve.init();
//        orderBookCodeSha3 = getCodeSha3(address(reserve));
//    }

    function addOrderBookContract(ERC20 token) public returns(bool) {

        require(reserveListingStage[token] == ListingStage.NO_RESERVE);

        reserves[token] = new OrderBookReserve(kncToken, token, feeBurnerResolverContract, ordersFactory);
        reserveListingStage[token] = ListingStage.RESERVE_ADDED;

        return true;
    }

    function initOrderBookContract(ERC20 token) public returns(bool) {

        require(reserveListingStage[token] == ListingStage.RESERVE_ADDED);

        reserves[token].init();
        reserveListingStage[token] = ListingStage.RESERVE_INIT;

        return true;
    }

    function listOrderBookContract(ERC20 token) public returns(bool) {

        require(reserveListingStage[token] == ListingStage.RESERVE_INIT);

        kyberNetworkContract.addReserve(KyberReserveInterface(reserves[token]), true, true);

        kyberNetworkContract.listPairForReserve(KyberReserveInterface(reserves[token]), token, true, true, true);
        reserveListingStage[token] = ListingStage.RESERVE_LISTED;

        return true;
    }

    /// @dev permission less reserve currently supports one token each.
    /// @dev anyone can call
    function getOrderBookContract(ERC20 token) public view returns(address, bool isReady) {
        address reserve = reserves[token];
        isReady = reserveListingStage[token] == ListingStage.RESERVE_LISTED;
        return(reserve, isReady);
    }
}
