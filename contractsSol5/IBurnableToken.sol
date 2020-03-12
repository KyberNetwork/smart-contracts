pragma solidity 0.5.11;

interface IBurnableToken {
    function burn(uint _value) external returns(bool);
}
