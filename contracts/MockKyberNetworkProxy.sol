pragma solidity 0.4.18;

import "./ERC20Interface.sol";
import "./MockKyberNetworkProxyInterface.sol";
import "./MockKyberNetworkInterface.sol";


contract MockKyberNetworkProxy is MockKyberNetworkProxyInterface {
    MockKyberNetworkInterface public networkContract;

    function MockKyberNetworkProxy(MockKyberNetworkInterface _networkContract) public {
        require(address(_networkContract) != address(0));
        networkContract = _networkContract;
    }

    // will be used only to trade token to Ether,
    // hint is NOT USED
    function tradeWithHint(
        ERC20 src,
        uint srcAmount,
        ERC20 dest,
        address destAddress,
        uint maxDestAmount,
        uint minConversionRate,
        address walletId,
        bytes hint
    )
        public
        payable
        returns(uint)
    {
        require(msg.value == 0); //strictly ERC20 tokens
        require(src.transferFrom(msg.sender, address(networkContract), srcAmount));
        return networkContract.tradeWithHint(
        src,
        srcAmount,
        dest,
        destAddress,
        maxDestAmount,
        minConversionRate,
        walletId,
        hint
        );
    }

    function getExpectedRate(ERC20 src, ERC20 dest, uint srcQty)
        public view
        returns(uint expectedRate, uint slippageRate)
    {
        return networkContract.getExpectedRate(src, dest, srcQty);
    }
}
