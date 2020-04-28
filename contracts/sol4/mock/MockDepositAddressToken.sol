pragma solidity ^0.4.18;

import "./MockCentralBank.sol";
import "./MockDepositAddress.sol";

/// @title Mock Deposit Address for token
/// @author Ilan Doron
/// @dev a dummy contract that simulates a deposit address of a token on a specific exchange. allows reserve manager to deposit and withdraw
contract MockDepositAddressToken is MockDepositAddress{

    ERC20 public token;

    function MockDepositAddressToken(ERC20 _token, MockCentralBank _bank, address _owner)
        MockDepositAddress(_bank, _owner)
        public
    {
        token = _token;
    }

    function withdraw(uint tokenAmount, address destination) public onlyOwner {
        bank.withdrawToken(token, tokenAmount);
        token.transfer(destination, tokenAmount);
    }

    function clearBalance(uint amount) public
        onlyOwner
    {
        if (token.balanceOf(this) >= amount) {
            token.transfer(bank, amount);
        }
    }

    function getBalance() public view returns (uint) {
        return token.balanceOf(this);
    }
}