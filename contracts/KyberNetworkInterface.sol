pragma solidity 0.4.18;


import "./ERC20Interface.sol";
import "./KyberReserveInterface.sol";


/// @title Kyber Network interface
contract KyberNetworkInterface {
    function trade(address sender, ERC20 src, uint srcAmount, ERC20 dest, address destAddress, uint maxDestAmount,
                    uint minConversionRate, address walletId) public payable returns(uint);
    function maxGasPrice() public view returns(uint);
    function getUserCapInWei(address user) public view returns(uint);
    function isEnabled() public view returns(bool);
    function getInfo(bytes32 id) public view returns(uint);
    function getExpectedRate(ERC20 src, ERC20 dest, uint srcQty) public view
        returns (uint expectedRate, uint slippageRate);
    function getExpectedRateWithHint(ERC20 src, ERC20 dest, uint srcQty) public view
        returns (uint expectedRate, uint slippageRate, address[4] reserveArr);
    function tradeWithHint(address trader, ERC20 src, uint srcAmount, ERC20 dest, address destAddress, uint maxDestAmount,
        uint minConversionRate, address walletId, address[] reserveHint) public payable returns(uint);
}
