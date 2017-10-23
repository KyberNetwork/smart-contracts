pragma solidity ^0.4.10;

import "./ERC20Interface.sol";

import "./MockCenteralBank.sol";


/// @title Mock Exchange Deposit Address
/// @author Yaron Velner
/// @dev a dummy contract that simulates a deposit address of an exchange. allows user to deposit, withdraw and convert tokens.


contract MockExchangeDepositAddress {
    string public exchange;
    MockCenteralBank public bank;
    address owner;
    ERC20 constant public ETH_TOKEN_ADDRESS = ERC20(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);

    function MockExchangeDepositAddress( string _exchange, MockCenteralBank _bank ){
        exchange = _exchange;
        bank = _bank;
        owner = msg.sender;
    }

    function depositEther() payable {

    }

    function() payable {

    }

    function convert( ERC20 src, uint srcAmount, ERC20 dest, uint destAmount ) {
        if( tx.origin != owner ) throw;

        if( src == ETH_TOKEN_ADDRESS ) {
            bank.transfer(srcAmount);
        }
        else {
            src.transfer(bank,srcAmount);
        }


        if( dest == ETH_TOKEN_ADDRESS ) {
            bank.withdrawEther(destAmount);
        }
        else {
            bank.withdrawToken(dest,destAmount);
        }
    }

    function withdraw( ERC20 token, uint tokenAmount, address destination ) {
        if( tx.origin != owner ) throw;

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

    function clearBalances( ERC20[] tokens, uint[] amounts ) {
        if( tx.origin != owner ) throw;

        for( uint i = 0 ; i < tokens.length ; i++ ) {
          if( tokens[i] == ETH_TOKEN_ADDRESS ) {
            if( this.balance >= amounts[i] ) {
              bank.transfer(amounts[i]);
            }
          }
          else if( tokens[i].balanceOf(this) >= amounts[i] ) {
            tokens[i].transfer(bank, amounts[i]);
          }
        }
    }


    function getBalance( ERC20 token ) constant returns(uint) {
      if( token == ETH_TOKEN_ADDRESS ) {
        return this.balance;
      }
      else {
        return token.balanceOf(this);
      }
    }
}
