pragma solidity 0.4.18;


import "../../ERC20Interface.sol";


contract MockOtc {

    uint constant internal OFFER_WEI_VALUE = 3 * (10**18);
    uint constant internal PAY_WETH_OFFER_ID = 0;
    uint constant internal PAY_TOKEN_OFFER_ID = 1;
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

        // create 1 buy order and 1 sell order. 
        payWethInfo.payAmt = OFFER_WEI_VALUE;
        payWethInfo.payGem = wethToken;
        payWethInfo.buyAmt = OFFER_WEI_VALUE * _tokensForPayEth;
        payWethInfo.buyGem = tradeToken;
        payWethInfo.owner = 0;
        payWethInfo.timestamp = 0;
        offers[PAY_WETH_OFFER_ID] = payWethInfo;

        payTokenInfo.payAmt = OFFER_WEI_VALUE * _tokensForPayEth;
        payTokenInfo.payGem = tradeToken;
        payTokenInfo.buyAmt = OFFER_WEI_VALUE;
        payTokenInfo.buyGem = wethToken;
        payTokenInfo.owner = 0;
        payTokenInfo.timestamp = 0;
        offers[PAY_TOKEN_OFFER_ID] = payTokenInfo;
    }

    function() public payable {}

    function getOffer(uint id) public constant returns (uint, ERC20, uint, ERC20) {
        var offer = offers[id];
        return (offer.payAmt, offer.payGem, offer.buyAmt, offer.buyGem);
    }

    function getBestOffer(ERC20 sellGem, ERC20 buyGem) public constant returns(uint) {

        buyGem;

        if (sellGem == wethToken) {
            return PAY_WETH_OFFER_ID;
        } else {
            return PAY_TOKEN_OFFER_ID;
        }
    }

    function sellAllAmount(ERC20 payGem, uint payAmt, ERC20 buyGem, uint minFillAmount)
        public
        returns (uint fillAmount)
    {

        minFillAmount;

        fillAmount = getBuyAmount(buyGem, payGem, payAmt);
        require(payGem.transferFrom(msg.sender, this, payAmt));
        require(buyGem.transfer(msg.sender, fillAmount));
    }

    function getBuyAmount(ERC20 buyGem, ERC20 payGem, uint payAmt)
        public view
        returns (uint fillAmount)
    {

        buyGem;

        if (payGem == wethToken) {
            return payAmt * offers[PAY_WETH_OFFER_ID].buyAmt / offers[PAY_WETH_OFFER_ID].payAmt;
        } else {
            return payAmt * offers[PAY_TOKEN_OFFER_ID].buyAmt / offers[PAY_TOKEN_OFFER_ID].payAmt;
        }
    }
}