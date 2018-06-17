pragma solidity 0.4.18;


import "../Utils2.sol";


/// @title Kyber utils contract
contract MockUtils2 is Utils2 {
    function mockGetDecimalsSafe(ERC20 token) public view returns(uint) {
        return decimals[token];
    }

    function mockSetDecimalsSafe(ERC20 token) public {
        setDecimals(token);
    }
}
