pragma solidity 0.4.18;


import "./OrderFactoryInterface.sol";


interface OrderBookReserveInterface {
    function init(OrderFactoryInterface orderFactory) public returns(bool);
}
