pragma solidity 0.4.18;


import "./Orders.sol";


contract OrdersFactory {
    function newOrdersContract(address admin) public returns(OrdersInterface) {
        Orders orders = new Orders(admin);
        return orders;
    }
}
