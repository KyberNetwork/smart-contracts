pragma solidity 0.4.18;


import "./OrderListInterface.sol";


interface OrderListFactoryInterface {
    function newOrdersContract(address admin) public returns(OrderListInterface);
}
