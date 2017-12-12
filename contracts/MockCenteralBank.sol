pragma solidity ^0.4.10;

import "./ERC20Interface.sol";


/// @title Mock Ceneteral Bank
/// @author Yaron Velner
/// @dev a dummy contract that simulates a bank that holds tokens and ether. centeralized exchanges can convert tokens here.


contract MockCenteralBank {
    mapping(address=>bool) public owners;

    function MockCenteralBank() public {
        owners[msg.sender] = true;
    }

    function withdrawEther( uint amount ) public {
        if( ! owners[tx.origin] ) revert();

        msg.sender.transfer(amount);
    }

    function withdrawToken( ERC20 token, uint amount ) public {
        if( ! owners[tx.origin] ) revert();

        token.transfer(msg.sender,amount);
    }

    function() payable public {

    }

    function depositEther() public payable {
        // just to simplify interaction with testrpc
    }

    function addOwner( address newOwner ) public {
      if( ! owners[tx.origin] ) revert();
      owners[newOwner] = true;
    }
}
