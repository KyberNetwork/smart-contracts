pragma solidity 0.5.9;


contract ReentrancyAttackV5 {
    function callSender(bytes4 data) public {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success,) = msg.sender.call(abi.encodeWithSelector(data));
        require(success, "ReentrancyAttack: failed call");
    }
}
