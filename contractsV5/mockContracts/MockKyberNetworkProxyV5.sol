pragma solidity 0.5.9;

import "../ERC20Interface.sol";
import "./MockKyberNetworkProxyInterfaceV5.sol";
import "./MockKyberNetworkInterfaceV5.sol";


contract MockKyberNetworkProxyV5 is MockKyberNetworkProxyInterfaceV5 {
    MockKyberNetworkInterfaceV5 public networkContract;

    constructor(MockKyberNetworkInterfaceV5 _networkContract) public {
        require(address(_networkContract) != address(0));
        networkContract = _networkContract;
    }

    // will be used only to trade token to Ether,
    // hint is NOT USED
    function tradeWithHint(
        ERC20 src,
        uint srcAmount,
        ERC20 dest,
        address payable destAddress,
        uint maxDestAmount,
        uint minConversionRate,
        address walletId,
        bytes calldata hint
    )
        external
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
        external view
        returns(uint expectedRate, uint slippageRate)
    {
        return networkContract.getExpectedRate(src, dest, srcQty);
    }
}
