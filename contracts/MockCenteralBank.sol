pragma solidity ^0.4.10;

import "./ERC20Interface.sol";


contract MockCenteralBank {
    address public owner;

    function MockCenteralBank() {
        owner = msg.sender;
    }
    
    function withdrawEther( uint amount ) {
        if( tx.origin != owner ) throw;
            
        msg.sender.transfer(amount);
    }
    
    function withdrawToken( ERC20 token, uint amount ) {
        if( tx.origin != owner ) throw;
            
        token.transfer(msg.sender,amount);
    }
    
    function() payable {
        
    }
    
    function depositEther() payable {
        // just to simplify interaction with testrpc
    }
}