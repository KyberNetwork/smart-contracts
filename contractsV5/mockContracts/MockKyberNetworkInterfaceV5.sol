pragma solidity 0.5.9;

import "../ERC20Interface.sol";


/// @title Mock Kyber Network interface
interface MockKyberNetworkInterfaceV5 {
    function tradeWithHint(ERC20 src, uint srcAmount, ERC20 dest, address payable destAddress, uint maxDestAmount,
        uint minConversionRate, address walletId, bytes calldata hint) external payable returns(uint);

    function getExpectedRate(ERC20 src, ERC20 dest, uint srcQty) external view
        returns (uint expectedRate, uint slippageRate);
}
