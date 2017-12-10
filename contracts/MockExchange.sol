pragma solidity ^0.4.10;

import "./ERC20Interface.sol";
import "./MockCenteralBank.sol";
import "./MockDepositAddressEther.sol";
import "./MockDepositAddressToken.sol";

/// @title Mock Exchange Deposit Address
/// @author Ilan Doron
/// @dev a dummy contract that simulates a deposit address of an exchange. allows user to deposit, withdraw and convert tokens.

contract MockExchange {

    string public exchangeName;
    MockCenteralBank public bank;
    mapping(address=>bool) public owners;
    mapping(address=>MockDepositAddress) public tokenDepositAddresses;
    ERC20 constant public ETH_TOKEN_ADDRESS = ERC20(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);

    function MockExchange( string _exchangeName, MockCenteralBank _bank) public {
        exchangeName = _exchangeName;
        bank = _bank;
        owners[msg.sender] = true;
    }

    modifier onlyOwner( )
    {
        require(owners[msg.sender]);
        _;
    }

    function withdraw( ERC20 token, uint tokenAmount, address destination ) public
        onlyOwner
    {
        require(tokenDepositAddresses[token] != address(0));
        // withdraw from mockDepositaddress. which withdraws from bank
        tokenDepositAddresses[token].withdraw(tokenAmount, destination);
    }

    function clearBalances( ERC20[] tokens, uint[] amounts ) public
        onlyOwner
    {
        for( uint i = 0 ; i < tokens.length ; i++ ) {
            if ( tokenDepositAddresses[tokens[i]] == address(0)) continue;
            tokenDepositAddresses[tokens[i]].clearBalance(amounts[i]);
        }
    }

    function getBalance( ERC20 token ) public view returns(uint) {
        return tokenDepositAddresses[token].getBalance();
    }

    function addOwner( address newOwner ) public
        onlyOwner
    {
        owners[newOwner] = true;
    }

    function addMockDepositAddress( ERC20 token ) public
        onlyOwner
    {
        if (token == ETH_TOKEN_ADDRESS)
            tokenDepositAddresses[token] = new MockDepositAddressEther(bank, this);
        else
            tokenDepositAddresses[token] = new MockDepositAddressToken(token, bank, this);

        bank.addOwner(tokenDepositAddresses[token]);
    }

    function () public payable {

    }
}