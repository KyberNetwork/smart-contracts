pragma solidity 0.4.18;


import "./OrderBookReserve.sol";
import "../FeeBurnerInterface.sol";


interface InternalNetworkInterface {
    function addReserve(KyberReserveInterface reserve, bool add, bool isPermissionless) public returns(bool);
    function listPairForReserve(address reserve, ERC20 token, bool ethToToken, bool tokenToEth, bool add) public
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

        reserves[token] = new OrderBookReserve(kncToken, token, feeBurnerResolverContract, ordersFactory);
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

        require(kyberNetworkContract.addReserve(KyberReserveInterface(reserves[token]), true, true));

        require(
            kyberNetworkContract.listPairForReserve(KyberReserveInterface(reserves[token]), token, true, true, true)
        );

        //todo: list reserve in fee burner contract. fee 25.
        //todo: tests. make sure lister is operator for fee bunere. and the operator can add reserve data to fee burner.
        reserveListingStage[token] = ListingStage.RESERVE_LISTED;
        TokenOrderBookListingStage(token, ListingStage.RESERVE_LISTED);

        return true;
    }

    /// @dev permission less reserve currently supports one token per reserve.
    function getOrderBookContractState(ERC20 token) public view returns(address, ListingStage) {
        return (reserves[token], reserveListingStage[token]);
    }
}
