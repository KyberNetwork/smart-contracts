pragma solidity ^0.4.18;


import "../Withdrawable.sol";


contract MockWithdrawable is Withdrawable {
    function () public payable { }
}
