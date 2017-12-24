pragma solidity ^0.4.18;


import "./ERC20Interface.sol";
import "./PermissionGroups.sol";


/**
 * @title Contracts that should be able to recover tokens or ethers
 * @author Ilan Doron
 * @dev This allow a contract to recover any tokens or Ethers received in a contract.
 * This will prevent any accidental loss of tokens.
 */
contract Withdrawable is PermissionGroups {

    event WithdrawToken ( ERC20 token, uint amount, address sendTo );
    /**
     * @dev Withdraw all ERC20 compatible tokens
     * @param token ERC20 The address of the token contract
     */
    function withdrawToken( ERC20 token, uint amount, address sendTo ) external onlyAdmin {
        uint balance = token.balanceOf(this);
        require (amount >= balance);
        assert(token.transfer(sendTo, balance));
        WithdrawToken(token, balance, sendTo);
    }

    event WithdrawEther ( uint amount, address sendTo );
    /**
     * @dev Withdraw Ethers
     */
    function withdrawEther ( uint amount, address sendTo ) external onlyAdmin {
        uint balance = this.balance;
        require (amount >= balance);
        sendTo.transfer(balance);
        WithdrawEther(balance, sendTo);
    }
}