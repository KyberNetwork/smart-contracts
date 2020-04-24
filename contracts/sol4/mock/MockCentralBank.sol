pragma solidity ^0.4.18;

import "../ERC20Interface.sol";


/// @title Mock Central Bank
/// @author Yaron Velner
/// @dev a dummy contract that simulates a bank that holds tokens and ether. centralized exchanges can convert tokens here.


contract MockCentralBank {
    mapping(address=>bool) public owners;

    function MockCentralBank() public {
        owners[msg.sender] = true;
    }

    function() payable public { }

    function withdrawEther(uint amount) public {
        if (! owners[tx.origin]) revert();

        msg.sender.transfer(amount);
    }

    function withdrawToken(ERC20 token, uint amount) public {
        if (!owners[tx.origin]) revert();

        token.transfer(msg.sender,amount);
    }

    function depositEther() public payable {
        // just to simplify interaction with testrpc
    }

    function addOwner(address newOwner) public {
      if ( ! owners[tx.origin] ) revert();
      owners[newOwner] = true;
    }
}
