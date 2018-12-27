pragma solidity 0.4.18;


import "../../ERC20Interface.sol";


contract MockOtc {

    uint constant internal OFFER_WEI_VALUE = 3 * (10**18);
    uint constant internal MAKER_PAYS_DAI_OFFER_ID = 1;
    uint constant internal MAKER_BUYS_DAI_OFFER_ID = 2;
    uint constant internal MAKER_PAYS_MKR_FIRST_OFFER_ID = 3;
    uint constant internal MAKER_PAYS_MKR_SECOND_OFFER_ID = 4;
    uint constant internal MAKER_PAYS_MKR_THIRD_OFFER_ID = 5;
    uint constant internal MAKER_BUYS_MKR_FIRST_OFFER_ID = 6;
    uint constant internal MAKER_BUYS_MKR_SECOND_OFFER_ID = 7;
    uint constant internal MAKER_BUYS_MKR_THIRD_OFFER_ID = 8;
    ERC20 public wethToken;
    ERC20 public daiToken;
    ERC20 public mkrToken;
    uint public daisForPayEth;
    uint public mkrForPayEth1st;
    uint public mkrForPayEth2nd;
    uint public mkrForPayEth3rd;

    mapping (uint => OfferInfo) public offers;

    struct OfferInfo {
        uint     payAmt;
        ERC20    payGem;
        uint     buyAmt;
        ERC20    buyGem;
        address  owner;
        uint64   timestamp;
    }

    function MockOtc(
        ERC20 _wethToken,
        ERC20 _daiToken,
        ERC20 _mkrToken,
        uint _daisForPayEth,
        uint _mkrForPayEth1st,
        uint _mkrForPayEth2nd,
        uint _mkrForPayEth3rd
    )
        public
    {
        wethToken = _wethToken;
        daiToken = _daiToken;
        mkrToken = _mkrToken;
        daisForPayEth = _daisForPayEth;
        mkrForPayEth1st = _mkrForPayEth1st;
        mkrForPayEth2nd = _mkrForPayEth2nd;
        mkrForPayEth3rd = _mkrForPayEth3rd;

        OfferInfo memory buyDaiInfo;
        OfferInfo memory payDaiInfo;
        OfferInfo memory buyMkrInfo;
        OfferInfo memory payMkrInfo;

        // create 1 order where the maker buys weth and pays dai.
        payDaiInfo.payAmt = OFFER_WEI_VALUE * _daisForPayEth;
        payDaiInfo.payGem = daiToken;
        payDaiInfo.buyAmt = OFFER_WEI_VALUE;
        payDaiInfo.buyGem = wethToken;
        payDaiInfo.owner = 0;
        payDaiInfo.timestamp = 0;
        offers[MAKER_PAYS_DAI_OFFER_ID] = payDaiInfo;

        // create 1 order where the maker buys dai and pays weth.
        buyDaiInfo.payAmt = OFFER_WEI_VALUE;
        buyDaiInfo.payGem = wethToken;
        buyDaiInfo.buyAmt = OFFER_WEI_VALUE * _daisForPayEth;
        buyDaiInfo.buyGem = daiToken;
        buyDaiInfo.owner = 0;
        buyDaiInfo.timestamp = 0;
        offers[MAKER_BUYS_DAI_OFFER_ID] = buyDaiInfo;

        // create 3 orders where the maker buys weth and pays mkr.
        payMkrInfo.payAmt = 1 * OFFER_WEI_VALUE  * _mkrForPayEth1st;
        payMkrInfo.payGem = mkrToken;
        payMkrInfo.buyAmt = 1 * OFFER_WEI_VALUE;
        payMkrInfo.buyGem = wethToken;
        offers[MAKER_PAYS_MKR_FIRST_OFFER_ID] = payMkrInfo;

        payMkrInfo.payAmt = 2 * OFFER_WEI_VALUE  * _mkrForPayEth2nd;
        payMkrInfo.buyAmt = 2 * OFFER_WEI_VALUE;
        offers[MAKER_PAYS_MKR_SECOND_OFFER_ID] = payMkrInfo;

        payMkrInfo.payAmt = 3 * OFFER_WEI_VALUE  * _mkrForPayEth3rd;
        payMkrInfo.buyAmt = 3 * OFFER_WEI_VALUE;
        offers[MAKER_PAYS_MKR_THIRD_OFFER_ID] = payMkrInfo;

        // create 3 orders where the maker buys mkr and pays weth.
        buyMkrInfo.payAmt = 1 * OFFER_WEI_VALUE;
        buyMkrInfo.payGem = wethToken;
        buyMkrInfo.buyAmt = 1 * OFFER_WEI_VALUE  * _mkrForPayEth1st;
        buyMkrInfo.buyGem = mkrToken;
        offers[MAKER_BUYS_MKR_FIRST_OFFER_ID] = buyMkrInfo;

        buyMkrInfo.payAmt = 2 * OFFER_WEI_VALUE;
        buyMkrInfo.buyAmt = 2 * OFFER_WEI_VALUE  * _mkrForPayEth2nd;
        offers[MAKER_BUYS_MKR_SECOND_OFFER_ID] = buyMkrInfo;

        buyMkrInfo.payAmt = 3 * OFFER_WEI_VALUE;
        buyMkrInfo.buyAmt = 3 * OFFER_WEI_VALUE  * _mkrForPayEth3rd;
        offers[MAKER_BUYS_MKR_THIRD_OFFER_ID] = buyMkrInfo;
    }

    function setFirstLevelDaiPrices(uint _daiPerEthBuy, uint _daiPerEthSell) public {
        offers[MAKER_PAYS_DAI_OFFER_ID].payAmt = OFFER_WEI_VALUE * _daiPerEthSell;
        offers[MAKER_BUYS_DAI_OFFER_ID].buyAmt = OFFER_WEI_VALUE * _daiPerEthBuy;
    }

    function() public payable {}

    function getOffer(uint id) public constant returns (uint, ERC20, uint, ERC20) {
        var offer = offers[id];
        return (offer.payAmt, offer.payGem, offer.buyAmt, offer.buyGem);
    }

    function getBestOffer(ERC20 offerSellGem, ERC20 offerBuyGem) public constant returns(uint) {

        if (offerSellGem == wethToken && offerBuyGem == daiToken) {
            return MAKER_BUYS_DAI_OFFER_ID;
        } else if (offerSellGem == daiToken && offerBuyGem == wethToken) {
            return MAKER_PAYS_DAI_OFFER_ID;
        } else if (offerSellGem == mkrToken && offerBuyGem == wethToken) {
            return MAKER_PAYS_MKR_FIRST_OFFER_ID;
        } else if (offerSellGem == wethToken && offerBuyGem == mkrToken ) {
            return MAKER_BUYS_MKR_FIRST_OFFER_ID;
        } else {
            return 0;
        }
    }

    function sellAllAmount(ERC20 takerPayGem, uint takerPayAmt, ERC20 takerBuyGem, uint minFillAmount)
        public
        returns (uint fillAmount)
    {
        if (takerPayGem == wethToken && takerBuyGem == daiToken) {
            fillAmount = takerPayAmt * offers[MAKER_PAYS_DAI_OFFER_ID].payAmt / offers[MAKER_PAYS_DAI_OFFER_ID].buyAmt;
        } else if (takerPayGem == daiToken && takerBuyGem == wethToken) {
            fillAmount = takerPayAmt * offers[MAKER_BUYS_DAI_OFFER_ID].payAmt / offers[MAKER_BUYS_DAI_OFFER_ID].buyAmt;
        } else {
            return 0;
        }

        require(minFillAmount <= fillAmount);
        buy(takerPayGem, takerPayAmt, takerBuyGem, fillAmount);
    }

    function getWorseOffer(uint id) public pure returns(uint) {
        if (id == MAKER_PAYS_MKR_FIRST_OFFER_ID) {
            return MAKER_PAYS_MKR_SECOND_OFFER_ID;
        } else if (id == MAKER_PAYS_MKR_SECOND_OFFER_ID) {
            return MAKER_PAYS_MKR_THIRD_OFFER_ID;
        } else if (id == MAKER_PAYS_MKR_THIRD_OFFER_ID) {
            return 0;
        } if (id == MAKER_BUYS_MKR_FIRST_OFFER_ID) {
            return MAKER_BUYS_MKR_SECOND_OFFER_ID;
        } else if (id == MAKER_BUYS_MKR_SECOND_OFFER_ID) {
            return MAKER_BUYS_MKR_THIRD_OFFER_ID;
        } else if (id == MAKER_BUYS_MKR_THIRD_OFFER_ID) {
            return 0;
        } else {
            return 0;
        }
    }

    function take(bytes32 id, uint128 takerBuyAmount) public {
        uint offerPayAmt;
        ERC20 offerPayGem;
        uint offerBuyAmt;
        ERC20 offerBuyGem;
    
        (offerPayAmt, offerPayGem, offerBuyAmt, offerBuyGem) = getOffer(uint256(id));
 
        uint takerPayAmount = takerBuyAmount * offerBuyAmt / offerPayAmt;
    
        require(uint128(takerBuyAmount) == takerBuyAmount);
        require(uint128(takerPayAmount) == takerPayAmount);
        buy(offerBuyGem, takerPayAmount, offerPayGem, takerBuyAmount);
    }

    function buy(ERC20 takerPayGem, uint takerPayAmt, ERC20 takerBuyGem, uint actualBuyAmt) internal {
        require(takerPayGem.transferFrom(msg.sender, this, takerPayAmt));
        require(takerBuyGem.transfer(msg.sender, actualBuyAmt));
    }
}
