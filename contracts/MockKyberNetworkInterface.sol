pragma solidity 0.4.18;

import "./ERC20Interface.sol";


/// @title Mock Kyber Network interface
interface MockKyberNetworkInterface {
    function tradeWithHint(ERC20 src, uint srcAmount, ERC20 dest, address destAddress, uint maxDestAmount,
        uint minConversionRate, address walletId, bytes hint) external payable returns(uint);

    function getExpectedRate(ERC20 src, ERC20 dest, uint srcQty) external view
        returns (uint expectedRate, uint slippageRate);
}
