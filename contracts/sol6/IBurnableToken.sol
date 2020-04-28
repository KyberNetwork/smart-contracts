pragma solidity 0.6.6;


interface IBurnableToken {
    function burn(uint256 _value) external returns (bool);
}
