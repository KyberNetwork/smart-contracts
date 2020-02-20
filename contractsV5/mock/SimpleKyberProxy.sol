pragma solidity 0.5.11;

import "../IERC20.sol";
import "../UtilsV5.sol";
import "../IKyberNetworkProxy.sol";


contract SimpleKyberProxy is IKyberNetworkProxy, Utils {
    mapping(bytes32=>uint) public pairRate; //rate in precision units. i.e. if rate is 10**18 its same as 1:1
    
    function() external payable {}

    function setPairRate(ERC20 src, ERC20 dest, uint rate) public {
        pairRate[keccak256(abi.encodePacked(src, dest))] = rate;
    }

    function getExpectedRate(ERC20 src, ERC20 dest, uint srcQty) public view
        returns (uint expectedRate, uint worstRate) 
    {
        srcQty;
        expectedRate = pairRate[keccak256(abi.encodePacked(src, dest))];
        worstRate = expectedRate * 97 / 100;
    }

    function tradeWithHint(ERC20 src, uint srcAmount, ERC20 dest, address destAddress, uint maxDestAmount,
        uint minConversionRate, address walletId, bytes calldata hint) external payable returns(uint)
    {
        hint;
        return trade(src, srcAmount, dest, address(uint160(address(destAddress))), maxDestAmount, minConversionRate, 
            address(uint160(address(walletId))));
    }

    // @dev trade function with same prototype as KyberNetwork
    // will be used only to trade token to Ether,
    // will work only when set pair worked.
    function trade(IERC20 src, uint srcAmount, IERC20 dest, address payable destAddress, uint maxDestAmount,
        uint minConversionRate, address payable platformWallet) 
        public payable returns(uint)
    {
        return tradeWithHintAndFee(src, srcAmount, dest, destAddress, maxDestAmount, minConversionRate,
             platformWallet, 0, "");
    }

    // new APIs
    function getExpectedRateAfterFee(IERC20 src, IERC20 dest, uint srcQty, uint customFeeBps, bytes calldata hint) 
        external view
        returns (uint expectedRate)
    {
        srcQty;
        customFeeBps;
        hint;
        expectedRate = pairRate[keccak256(abi.encodePacked(src, dest))];
        expectedRate = expectedRate * (BPS - customFeeBps) / customFeeBps;
    }
        
    function getPriceDataNoFees(IERC20 src, IERC20 dest, uint srcQty, bytes calldata hint) 
        external view 
        returns (uint rateNoFee)
    {
        srcQty;
        hint;
        rateNoFee = pairRate[keccak256(abi.encodePacked(src, dest))];
    }
    
    function tradeWithHintAndFee(IERC20 src, uint srcAmount, IERC20 dest, address payable destAddress, uint maxDestAmount,
        uint minConversionRate, address payable platformWallet, uint platformFeeBps, bytes memory hint) 
        public payable 
        returns(uint destAmount)
    {
        uint rate = pairRate[keccak256(abi.encodePacked(src, dest))];

        platformWallet;
        hint;
        
        require(rate > 0);
        require(rate > minConversionRate);
    
        destAmount = srcAmount * rate / PRECISION;
        uint actualSrcAmount = srcAmount;

        if (destAmount > maxDestAmount) {
            destAmount = maxDestAmount;
            actualSrcAmount = maxDestAmount * PRECISION / rate;
        }

        destAmount = destAmount * (BPS - platformFeeBps) / BPS;

        // address payable toAdd = address(uint160(this)); 
        require(src.transferFrom(msg.sender, address(this), actualSrcAmount));
        destAddress.transfer(destAmount);

        return destAmount;
    }
}
