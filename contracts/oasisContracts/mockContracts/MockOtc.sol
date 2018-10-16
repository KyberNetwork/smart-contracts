pragma solidity 0.4.18;


import "../../ERC20Interface.sol";


contract MockOtc {

    uint constant internal OFFER_WEI_VALUE = 3 * (10**18);
    uint constant internal MAKER_PAYS_DAI_OFFER_ID = 1;
    uint constant internal MAKER_BUYS_DAI_OFFER_ID = 2;
    uint constant internal MAKER_PAYS_MKR_FIRST_OFFER_ID = 3;
    uint constant internal MAKER_PAYS_MKR_SECOND_OFFER_ID = 4;
    uint constant internal MAKER_PAYS_MKR_THIRD_OFFER_ID = 5;
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
        payMkrInfo.owner = 0;
        payMkrInfo.timestamp = 0;
        offers[MAKER_PAYS_MKR_FIRST_OFFER_ID] = payMkrInfo;

        payMkrInfo.payAmt = 2 * OFFER_WEI_VALUE  * _mkrForPayEth2nd;
        payMkrInfo.buyAmt = 2 * OFFER_WEI_VALUE;
        offers[MAKER_PAYS_MKR_SECOND_OFFER_ID] = payMkrInfo;

        payMkrInfo.payAmt = 3 * OFFER_WEI_VALUE  * _mkrForPayEth3rd;
        payMkrInfo.buyAmt = 3 * OFFER_WEI_VALUE;
        offers[MAKER_PAYS_MKR_THIRD_OFFER_ID] = payMkrInfo;
    }

    function() public payable {}

    function getOffer(uint id) public constant returns (uint, ERC20, uint, ERC20) {
        var offer = offers[id];
        return (offer.payAmt, offer.payGem, offer.buyAmt, offer.buyGem);
    }

    function getBestOffer(ERC20 sellGem, ERC20 buyGem) public constant returns(uint) {

        if (sellGem == wethToken && buyGem == daiToken) {
            return MAKER_BUYS_DAI_OFFER_ID;
        } else if (sellGem == daiToken && buyGem == wethToken) {
            return MAKER_PAYS_DAI_OFFER_ID;
        } else if (sellGem == mkrToken && buyGem == wethToken) {
            return MAKER_PAYS_MKR_FIRST_OFFER_ID;
        } else {
            return 0;
        }
    }

    function sellAllAmount(ERC20 payGem, uint payAmt, ERC20 buyGem, uint minFillAmount)
        public
        returns (uint fillAmount)
    {
        if (payGem == wethToken && buyGem == daiToken) {
            fillAmount = payAmt * offers[MAKER_PAYS_DAI_OFFER_ID].payAmt / offers[MAKER_PAYS_DAI_OFFER_ID].buyAmt;
        } else if (payGem == daiToken && buyGem == wethToken) {
            fillAmount = payAmt * offers[MAKER_BUYS_DAI_OFFER_ID].payAmt / offers[MAKER_BUYS_DAI_OFFER_ID].buyAmt;
        } else {
            return 0;
        }

        require(minFillAmount <= fillAmount);

        buy(payGem, payAmt, buyGem, fillAmount);
    }

    function getWorseOffer(uint id) public pure returns(uint) {
        if (id == MAKER_PAYS_MKR_FIRST_OFFER_ID) {
            return MAKER_PAYS_MKR_SECOND_OFFER_ID;
        } else if (id == MAKER_PAYS_MKR_SECOND_OFFER_ID) {
            return MAKER_PAYS_MKR_THIRD_OFFER_ID;
        } else if (id == MAKER_PAYS_MKR_THIRD_OFFER_ID) {
            return 0;
        } else {
            return 0;
        }
    }



////////////////////////////////////////////////////////////////////////////////////
/*
    // Accept given `quantity` of an offer. Transfers funds from caller to
    // offer maker, and from market to caller.
    function buy(uint id, uint quantity)
        public
        can_buy(id)
        synchronized
        returns (bool)
    {
        OfferInfo memory offer = offers[id];
        uint spend = mul(quantity, offer.buy_amt) / offer.pay_amt;

        require(uint128(spend) == spend);
        require(uint128(quantity) == quantity);

        // For backwards semantic compatibility.
        if (quantity == 0 || spend == 0 ||
            quantity > offer.pay_amt || spend > offer.buy_amt)
        {
            return false;
        }

        offers[id].pay_amt = sub(offer.pay_amt, quantity);
        offers[id].buy_amt = sub(offer.buy_amt, spend);
        require( offer.buy_gem.transferFrom(msg.sender, offer.owner, spend) );
        require( offer.pay_gem.transfer(msg.sender, quantity) );

        LogItemUpdate(id);
        LogTake(
            bytes32(id),
            keccak256(offer.pay_gem, offer.buy_gem),
            offer.owner,
            offer.pay_gem,
            offer.buy_gem,
            msg.sender,
            uint128(quantity),
            uint128(spend),
            uint64(now)
        );
        LogTrade(quantity, offer.pay_gem, spend, offer.buy_gem);

        if (offers[id].pay_amt == 0) {
          delete offers[id];
        }

        return true;
    }
*/
//////////////////////////////////////////////////////////////////
 // need to replace take by the above





    function take(bytes32 id, uint128 maxTakeAmount) public {
        uint offerPayAmt;
        ERC20 offerPayGem;
        uint offerBuyAmt;
        ERC20 offerBuyGem;
        uint fillAmount;

        (offerPayAmt, offerPayGem, offerBuyAmt, offerBuyGem) = getOffer(uint256(id));

        fillAmount = maxTakeAmount * offerPayAmt / offerBuyAmt;
        ///require(minFillAmount <= fillAmount);

        buy(offerPayGem, offerPayAmt, offerBuyGem, fillAmount);
    }

    function buy(ERC20 payGem, uint payAmt, ERC20 buyGem, uint actualBuyAmt) internal {
        require(payGem.transferFrom(msg.sender, this, payAmt));
        require(buyGem.transfer(msg.sender, actualBuyAmt));
    }
}