pragma solidity 0.4.18;


import "./OrdersInterface.sol";


interface OrderFactoryInterface {
    function newOrdersContract(address admin) public returns(OrdersInterface);
}
