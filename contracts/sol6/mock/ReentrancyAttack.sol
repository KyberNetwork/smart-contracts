pragma solidity 0.6.6;


contract ReentrancyAttack {
    function callSender(bytes4 data) public {
        (bool success, ) = msg.sender.call(abi.encodeWithSelector(data));
        require(success, "ReentrancyAttack: failed call");
    }
}
