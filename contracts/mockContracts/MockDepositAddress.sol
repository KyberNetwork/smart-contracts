pragma solidity ^0.4.18;

import "../ERC20Interface.sol";
import "./MockCentralBank.sol";

/// @title Mock Deposit Address
/// @author Ilan Doron
/// @dev a dummy contract that simulates a deposit address of a token on a specific exchange. allows reserve manager to deposit and withdraw


contract MockDepositAddress {

    MockCentralBank public bank;
    address public owner;

    /// @dev Ctor of this
    /// @param _bank bank address to work with for deposit and withdraw
    /// @param _owner owner address for this contract.
    function MockDepositAddress( MockCentralBank _bank, address _owner ) public {
        owner = _owner;
        bank = _bank;
    }

    modifier onlyOwner( )
    {
        require(msg.sender == owner);
        _;
    }

    event Withdraw(uint amount , address destianation);

    function withdraw(uint tokenAmount, address destination) public;

    function clearBalance(uint amount) public;

    function getBalance() public view returns (uint);
}
