pragma solidity ^0.4.10;

import "./ERC20.sol";
import "./MockCenteralBank.sol";
import "./MockDepositAddress.sol";

/// @title Mock Exchange Deposit Address
/// @author Ilan Doron
/// @dev a dummy contract that simulates a deposit address of an exchange. allows user to deposit, withdraw and convert tokens.

contract MockExchange {

    string public exchangeName;
    MockCenteralBank public bank;
    mapping(address=>bool) public owners;
    mapping(address=>MockDepositAddress) public MapTokenDepositAddresses;
    ERC20 constant public ETH_TOKEN_ADDRESS = ERC20(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);

    function MockExchange( string _exchange, MockCenteralBank _bank) public {
        exchange = _exchange;
        bank = _bank;
        owners[msg.sender] = true;
    }

    function withdraw(  ERC20 token, uint tokenAmount, address destination ) public {
        require(owners[msg.sender]);
        require(MapTokenDepositAddresses[token] != address(0));

        // withdraw from mockDepositaddress. which withdraws from bank
        MapTokenDepositAddresses[token].withdraw(tokenAmount, destination);
    }

    function clearBalances( ERC20[] tokens, uint[] amounts ) public {
        require(owners[msg.sender]);

        for( uint i = 0 ; i < tokens.length ; i++ ) {
            if ( MapTokenDepositAddresses[tokens[i]] == address(0)) continue;
            MapTokenDepositAddresses[tokens[i]].clearBalance(amounts[i]);
        }
    }


    function getBalance( ERC20 token ) public view returns(uint) {
        if( token == ETH_TOKEN_ADDRESS ) {
            return this.balance;
        }
        else {
            return token.balanceOf(this);
        }
    }


    function addOwner( address newOwner ) public {
        require(owners[msg.sender]);
        owners[newOwner] = true;
    }

    function addMockDepositAddress( ERC20 token, MockDepositAddress depositAddress) public {
        require(owners[msg.sender]);
        MapTokenDepositAddresses[token] = depositAddress;
    }

    function () public payable {

    }
}