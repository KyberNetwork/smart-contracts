pragma solidity 0.4.18;


import "../../ERC20Interface.sol";


contract MockOtc {

    uint constant internal OFFER_WEI_VALUE = 3 * (10**18);
    uint constant internal MAKER_PAYS_TOKEN_OFFER_ID = 0;
    uint constant internal MAKER_PAYS_WETH_OFFER_ID = 1;
    ERC20 public wethToken;
    ERC20 public tradeToken;
    uint public tokensForPayEth;

    mapping (uint => OfferInfo) public offers;

    struct OfferInfo {
        uint     payAmt;
        ERC20    payGem;
        uint     buyAmt;
        ERC20    buyGem;
        address  owner;
        uint64   timestamp;
    }

    function MockOtc(ERC20 _wethToken, ERC20 _tradeToken, uint _tokensForPayEth) public {
        wethToken = _wethToken;
        tradeToken = _tradeToken;
        tokensForPayEth = _tokensForPayEth;

        OfferInfo memory payWethInfo;
        OfferInfo memory payTokenInfo;

        // create 1 order where the maker buys weth and pays tokens.
        payWethInfo.payAmt = OFFER_WEI_VALUE * _tokensForPayEth;
        payWethInfo.payGem = tradeToken;
        payWethInfo.buyAmt = OFFER_WEI_VALUE;
        payWethInfo.buyGem = wethToken;
        payWethInfo.owner = 0;
        payWethInfo.timestamp = 0;
        offers[MAKER_PAYS_TOKEN_OFFER_ID] = payWethInfo;

        // create 1 order where the maker buys tokens and pays weth.
        payTokenInfo.payAmt = OFFER_WEI_VALUE;
        payTokenInfo.payGem = wethToken;
        payTokenInfo.buyAmt = OFFER_WEI_VALUE * _tokensForPayEth;
        payTokenInfo.buyGem = tradeToken;
        payTokenInfo.owner = 0;
        payTokenInfo.timestamp = 0;
        offers[MAKER_PAYS_WETH_OFFER_ID] = payTokenInfo;
    }

    function() public payable {}

    function getOffer(uint id) public constant returns (uint, ERC20, uint, ERC20) {
        var offer = offers[id];
        return (offer.payAmt, offer.payGem, offer.buyAmt, offer.buyGem);
    }

    function getBestOffer(ERC20 sellGem, ERC20 buyGem) public constant returns(uint) {

        buyGem;

        if (sellGem == wethToken) {
            // maker pays weth
            return MAKER_PAYS_WETH_OFFER_ID;
        } else {
            // maker pays tokens
            return MAKER_PAYS_TOKEN_OFFER_ID;
        }
    }

    function sellAllAmount(ERC20 payGem, uint payAmt, ERC20 buyGem, uint minFillAmount)
        public
        returns (uint fillAmount)
    {


        if (payGem == wethToken) {
            // taker pays weth, look for offer where maker pays tokens
            fillAmount = payAmt * offers[MAKER_PAYS_TOKEN_OFFER_ID].payAmt / offers[MAKER_PAYS_TOKEN_OFFER_ID].buyAmt;
        } else {
            // taker pays tokens, look for offer where maker pays weth
            fillAmount = payAmt * offers[MAKER_PAYS_WETH_OFFER_ID].payAmt / offers[MAKER_PAYS_WETH_OFFER_ID].buyAmt;
        }

        require(minFillAmount <= fillAmount);

        require(payGem.transferFrom(msg.sender, this, payAmt));
        require(buyGem.transfer(msg.sender, fillAmount));
    }
}