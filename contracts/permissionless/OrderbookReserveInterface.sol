pragma solidity 0.4.18;


import "./OrderListFactoryInterface.sol";


interface OrderbookReserveInterface {
    function init(OrderFactoryInterface orderFactory) public returns(bool);
    function kncRateBlocksTrade() public view returns(bool);
}
