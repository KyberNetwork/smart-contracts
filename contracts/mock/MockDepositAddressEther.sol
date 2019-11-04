pragma solidity ^0.4.18;

import "./MockCentralBank.sol";
import "./MockDepositAddress.sol";

/// @title Mock Deposit Address for Ethers
/// @author Ilan Doron
/// @dev a dummy contract that simulates a deposit address of a token on a specific exchange.
///         allows reserve manager to deposit and withdraw
contract MockDepositAddressEther is MockDepositAddress{

    function MockDepositAddressEther(MockCentralBank _bank, address _owner)
        MockDepositAddress(_bank, _owner)
        public
    {}

    function () public payable {}

    function withdraw(uint etherAmount, address destination) public onlyOwner {
        bank.withdrawEther(etherAmount);
        destination.transfer(etherAmount);
    }

    function clearBalance( uint amount ) public onlyOwner {
        if (this.balance >= amount) {
            bank.transfer(amount);
        }
    }

    function getBalance() public view returns (uint) {
        return this.balance;
    }
}