pragma solidity 0.4.18;


import "./OrderbookReserve.sol";
import "../../../FeeBurnerInterface.sol";


contract InternalNetworkInterface {
    function addReserve(
        NimbleReserveInterface reserve,
        bool isPermissionless
    )
        public
        returns(bool);

    function removeReserve(
        NimbleReserveInterface reserve,
        uint index
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
    uint constant public ORDERBOOK_BURN_FEE_BPS = 25;

    uint public minNewOrderValueUsd = 1000; // set in order book minimum USD value of a new limit order
    uint public maxOrdersPerTrade;          // set in order book maximum orders to be traversed in rate query and trade

    InternalNetworkInterface public NimbleNetworkContract;
    OrderListFactoryInterface public orderFactoryContract;
    MedianizerInterface public medianizerContract;
    ERC20 public kncToken;

    enum ListingStage {NO_RESERVE, RESERVE_ADDED, RESERVE_INIT, RESERVE_LISTED}

    mapping(address => OrderbookReserveInterface) public reserves; //Permissionless orderbook reserves mapped per token
    mapping(address => ListingStage) public reserveListingStage;   //Reserves listing stage
    mapping(address => bool) tokenListingBlocked;

    function PermissionlessOrderbookReserveLister(
        InternalNetworkInterface Nimble,
        OrderListFactoryInterface factory,
        MedianizerInterface medianizer,
        ERC20 knc,
        address[] unsupportedTokens,
        uint maxOrders,
        uint minOrderValueUsd
    )
        public
    {
        require(Nimble != address(0));
        require(factory != address(0));
        require(medianizer != address(0));
        require(knc != address(0));
        require(maxOrders > 1);
        require(minOrderValueUsd > 0);

        NimbleNetworkContract = Nimble;
        orderFactoryContract = factory;
        medianizerContract = medianizer;
        kncToken = knc;
        maxOrdersPerTrade = maxOrders;
        minNewOrderValueUsd = minOrderValueUsd;

        for (uint i = 0; i < unsupportedTokens.length; i++) {
            require(unsupportedTokens[i] != address(0));
            tokenListingBlocked[unsupportedTokens[i]] = true;
        }
    }

    event TokenOrderbookListingStage(ERC20 token, ListingStage stage);

    /// @dev anyone can call
    function addOrderbookContract(ERC20 token) public returns(bool) {
        require(reserveListingStage[token] == ListingStage.NO_RESERVE);
        require(!(tokenListingBlocked[token]));

        reserves[token] = new OrderbookReserve({
            knc: kncToken,
            reserveToken: token,
            burner: NimbleNetworkContract.feeBurnerContract(),
            network: NimbleNetworkContract,
            medianizer: medianizerContract,
            factory: orderFactoryContract,
            minNewOrderUsd: minNewOrderValueUsd,
            maxOrdersPerTrade: maxOrdersPerTrade,
            burnFeeBps: ORDERBOOK_BURN_FEE_BPS
        });

        reserveListingStage[token] = ListingStage.RESERVE_ADDED;

        TokenOrderbookListingStage(token, ListingStage.RESERVE_ADDED);
        return true;
    }

    /// @dev anyone can call
    function initOrderbookContract(ERC20 token) public returns(bool) {
        require(reserveListingStage[token] == ListingStage.RESERVE_ADDED);
        require(reserves[token].init());

        reserveListingStage[token] = ListingStage.RESERVE_INIT;
        TokenOrderbookListingStage(token, ListingStage.RESERVE_INIT);
        return true;
    }

    /// @dev anyone can call
    function listOrderbookContract(ERC20 token) public returns(bool) {
        require(reserveListingStage[token] == ListingStage.RESERVE_INIT);

        require(
            NimbleNetworkContract.addReserve(
                NimbleReserveInterface(reserves[token]),
                true
            )
        );

        require(
            NimbleNetworkContract.listPairForReserve(
                NimbleReserveInterface(reserves[token]),
                token,
                true,
                true,
                true
            )
        );

        FeeBurnerInterface feeBurner = FeeBurnerInterface(NimbleNetworkContract.feeBurnerContract());

        feeBurner.setReserveData(
            reserves[token], /* reserve */
            ORDERBOOK_BURN_FEE_BPS, /* fee */
            reserves[token] /* kncWallet */
        );

        reserveListingStage[token] = ListingStage.RESERVE_LISTED;
        TokenOrderbookListingStage(token, ListingStage.RESERVE_LISTED);
        return true;
    }

    function unlistOrderbookContract(ERC20 token, uint hintReserveIndex) public {
        require(reserveListingStage[token] == ListingStage.RESERVE_LISTED);
        require(reserves[token].kncRateBlocksTrade());
        require(NimbleNetworkContract.removeReserve(NimbleReserveInterface(reserves[token]), hintReserveIndex));
        reserveListingStage[token] = ListingStage.NO_RESERVE;
        reserves[token] = OrderbookReserveInterface(0);
        TokenOrderbookListingStage(token, ListingStage.NO_RESERVE);
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
