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

    /**
     * @dev Withdraw all ERC20 compatible tokens
     * @param token ERC20 The address of the token contract
     */
    function withdrawToken( ERC20 token, address sendTo ) external onlyAdmin {
        uint balance = token.balanceOf(this);
        token.transfer(sendTo, balance);
    }

    /**
     * @dev Withdraw Ethers
     */
    function withdrawEther ( address sendTo ) external onlyAdmin {
        uint balance = this.balance;
        sendTo.transfer(balance);
    }
}