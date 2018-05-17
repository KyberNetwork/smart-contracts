pragma solidity 0.4.18;


import "./ERC20Interface.sol";
import "./KyberReserveInterface.sol";


/// @title Kyber Network interface
contract KyberNetworkInterface {
    function doTrade(address sender, ERC20 src, uint srcAmount, ERC20 dest, address destAddress, uint maxDestAmount,
                    uint minConversionRate, address walletId) public payable returns(uint);
    function maxGasPrice() public view returns(uint);
    function getUserCapInWei(address user) public view returns(uint);
    function isEnabled() public view returns(bool);
    function getInfo(bytes32 id) public view returns(uint);
    function getExpectedRate(ERC20 src, ERC20 dest, uint srcQty) public view
        returns (uint expectedRate, uint slippageRate);
}
