pragma solidity 0.4.18;


import "./OrderListFactoryInterface.sol";


interface OrderbookReserveInterface {
    function init() public returns(bool);
    function NIMRateBlocksTrade() public view returns(bool);
}
