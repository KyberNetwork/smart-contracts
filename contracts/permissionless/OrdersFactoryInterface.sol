pragma solidity 0.4.18;


import "./OrdersInterface.sol";


interface OrdersFactoryInterface {
    function newOrdersContract(address admin) public returns(OrdersInterface);
}
