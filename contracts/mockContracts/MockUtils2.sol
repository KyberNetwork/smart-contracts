pragma solidity 0.4.18;


import "../Utils2.sol";


/// @title Kyber utils contract
contract MockUtils2 is Utils2 {
    function mockBetterGetDecimals(ERC20 token) internal returns(uint) {
        return betterGetDecimals(token);
    }
}
