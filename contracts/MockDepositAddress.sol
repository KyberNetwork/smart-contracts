pragma solidity ^0.4.10;


import "./ERC20.sol";

import "./MockCenteralBank.sol";


/// @title Mock Deposit Address
/// @author Ilan Doron
/// @dev a dummy contract that simulates a deposit address of a token on a specific exchange. allows reserve manager to deposit and withdraw


contract MockDepositAddress {

    MockCenteralBank public bank;
    ERC20 public token;
    mapping(address=>bool) public owners;
    ERC20 constant public ETH_TOKEN_ADDRESS = ERC20(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);
    string public Name = "some name";

    /// @dev Ctor of this
    /// @param _token - the token type this deposit address handles
    /// @param _bank bank address to work with for deposit and withdraw
    function MockDepositAddress(ERC20 _token, MockCenteralBank _bank) public{
        owners[msg.sender] = true;
        token = _token;
        bank = _bank;
    }


    function withdraw(uint tokenAmount, address destination )public{
        if (owners[msg.sender] != true) revert();

        // withdraw directly from the bank
        if( token == ETH_TOKEN_ADDRESS ) {
            bank.withdrawEther(tokenAmount);
            destination.transfer(tokenAmount);
        }
        else {
            bank.withdrawToken(token, tokenAmount);
            token.transfer(destination, tokenAmount );
        }
    }


    function addOwner( address newOwner ) external {
        if(owners[msg.sender] != true ) revert();
        owners[newOwner] = true;
    }

    function clearBalance( uint amount ) external {
        if (owners[msg.sender] != true) revert();
        if( token == ETH_TOKEN_ADDRESS ) {
            if( this.balance >= amount ) {
                bank.transfer(amount);
            }
        }
        else if( token.balanceOf(this) >= amount ) {
            token.transfer(bank, amount);
        }

    }


    function fallback() external payable{

    }

}
