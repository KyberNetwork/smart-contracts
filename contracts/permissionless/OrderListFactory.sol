pragma solidity 0.4.18;


import "./OrderList.sol";


contract OrdersFactory {
    function newOrdersContract(address admin) public returns(OrdersInterface) {
        Orders orders = new Orders(admin);
        return orders;
    }
}
