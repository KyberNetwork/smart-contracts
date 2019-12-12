pragma solidity 0.5.11;

import "./WethToken.sol";

// Simple mock contract for otc orderbook
contract MockOtcOrderbook {

    struct OfferInfo {
        uint     id;
        uint     payAmt;
        ERC20    payGem;
        uint     buyAmt;
        ERC20    buyGem;
    }

    OfferInfo[] public sellOffers;
    OfferInfo[] public buyOffers;

    ERC20 wethToken;
    ERC20 daiToken;

    constructor(ERC20 _wethToken, ERC20 _daiToken) public {
        wethToken = _wethToken;
        daiToken = _daiToken;
    }

    function setSellOffer(uint id, ERC20 offerSellGem, uint payAmt, ERC20 offerBuyGem, uint buyAmt) public {
        sellOffers.push(OfferInfo(id, payAmt, offerSellGem, buyAmt, offerBuyGem));
    }

    function setBuyOffer(uint id, ERC20 offerSellGem, uint payAmt, ERC20 offerBuyGem, uint buyAmt) public {
        buyOffers.push(OfferInfo(id, payAmt, offerSellGem, buyAmt, offerBuyGem));
    }

    function resetOffersData() public {
        sellOffers.length = 0;
        buyOffers.length = 0;
    }

    function() external payable {}

    function getOffer(uint id) public view returns (uint, ERC20, uint, ERC20) {
        for(uint i = 0; i < sellOffers.length; i++) {
            if (sellOffers[i].id == id) {
                return (sellOffers[i].payAmt, sellOffers[i].payGem, sellOffers[i].buyAmt, sellOffers[i].buyGem);
            }
        }
        for(uint i = 0; i < buyOffers.length; i++) {
            if (buyOffers[i].id == id) {
                return (buyOffers[i].payAmt, buyOffers[i].payGem, buyOffers[i].buyAmt, buyOffers[i].buyGem);
            }
        }
        return (0, wethToken, 0, daiToken);
    }

    function getBestOffer(ERC20 offerSellGem, ERC20 offerBuyGem) public view returns(uint) {
        if (offerSellGem == daiToken && offerBuyGem != wethToken) { return 0; }
        if (offerSellGem == wethToken && offerBuyGem != daiToken) { return 0; }
        if (offerSellGem == daiToken) {
            // buy WETH
            if (buyOffers.length == 0) { return 0; }
            return buyOffers[0].id;
        }
        if (sellOffers.length == 0) { return 0; }
        return sellOffers[0].id;
    }


    function getWorseOffer(uint id) public view returns(uint) {
        for(uint i = 0; i < sellOffers.length; i++) {
            if (sellOffers[i].id == id) {
                if (i + 1 < sellOffers.length) {
                    return sellOffers[i + 1].id;
                }
                return 0;
            }
        }
        for(uint i = 0; i < buyOffers.length; i++) {
            if (buyOffers[i].id == id) {
                if (i + 1 < buyOffers.length) {
                    return buyOffers[i + 1].id;
                }
                return 0;
            }
        }
        return 0;
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
        require(takerPayGem.transferFrom(msg.sender, address(this), takerPayAmt));
        require(takerBuyGem.transfer(msg.sender, actualBuyAmt));
    }
}
