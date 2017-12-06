pragma solidity ^0.4.10;

import "./ERC20.sol";
import "./MockCenteralBank.sol";


/// @title Mock Deposit Address
/// @author Ilan Doron
/// @dev a dummy contract that simulates a deposit address of a token on a specific exchange. allows reserve manager to deposit and withdraw


contract MockDepositAddress {
    MockCenteralBank public bank;
    ERC20 public token;
    address public owner;
    ERC20 constant public ETH_TOKEN_ADDRESS = ERC20(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);

    /// @dev Ctor of this
    /// @param _token - the token type this deposit address handles
    /// @param _bank bank address to work with for deposit and withdraw
    function MockDepositAddress( ERC20 _token, MockCenteralBank _bank ) public{
        owner = msg.sender;
        token = _token;
        bank = _bank;
    }

    modifier onlyBy( address _account )
    {
        require(msg.sender == _account);
        _;
    }

    function withdraw( uint tokenAmount, address destination ) public
        onlyBy(owner)
    {
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

    function clearBalance( uint amount ) public
        onlyBy(owner)
    {
        if( token == ETH_TOKEN_ADDRESS ) {
            if( this.balance >= amount ) {
                bank.transfer(amount);
            }
        }
        else if( token.balanceOf(this) >= amount ) {
            token.transfer(bank, amount);
        }
    }

    function () public payable {

    }
}
