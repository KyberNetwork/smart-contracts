pragma solidity ^0.4.10;

import "./ERC20Interface.sol";


/// @title Mock Ceneteral Bank
/// @author Yaron Velner
/// @dev a dummy contract that simulates a bank that holds tokens and ether. centeralized exchanges can convert tokens here.


contract MockCenteralBank {
    mapping(address=>bool) public owners;

    function MockCenteralBank() {
        owners[msg.sender] = true;
    }

    function withdrawEther( uint amount ) {
        if( ! owners[tx.origin] ) throw;

        msg.sender.transfer(amount);
    }

    function withdrawToken( ERC20 token, uint amount ) {
        if( ! owners[tx.origin] ) throw;

        token.transfer(msg.sender,amount);
    }

    function() payable {

    }

    function depositEther() payable {
        // just to simplify interaction with testrpc
    }

    function addOwner( address newOwner ) {
      if( ! owners[tx.origin] ) throw;
      owners[newOwner] = true;
    }
}
