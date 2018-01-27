pragma solidity 0.4.18;


interface FeeBurnerInterface {
    function handleFees (uint tradeWeiAmount, address reserve, address wallet) public returns(bool);
}
