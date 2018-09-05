pragma solidity ^0.4.0;


import "./Orders.sol";


contract OrdersFactory {
//    function OrdersFactory(){
//
//    }

    function newOrdersContract(address admin) public returns(OrdersInterface) {
        Orders orders = new Orders(admin);
        return orders;
    }
}
