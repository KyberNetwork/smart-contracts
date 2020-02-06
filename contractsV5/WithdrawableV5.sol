pragma solidity 0.5.11;

import "./IERC20.sol";
import "./PermissionGroupsV5.sol";


contract Withdrawable is PermissionGroups {

    constructor(address _admin) public 
        PermissionGroups(_admin) 
        {}
        
    event TokenWithdraw(IERC20 token, uint amount, address sendTo);

    /**
     * @dev Withdraw all IERC20 compatible tokens
     * @param token IERC20 The address of the token contract
     */
    function withdrawToken(IERC20 token, uint amount, address sendTo) external onlyAdmin {
        require(token.transfer(sendTo, amount));
        emit TokenWithdraw(token, amount, sendTo);
    }

    event EtherWithdraw(uint amount, address sendTo);

    /**
     * @dev Withdraw Ethers
     */
    function withdrawEther(uint amount, address payable sendTo) external onlyAdmin {
        sendTo.transfer(amount);
        emit EtherWithdraw(amount, sendTo);
    }
}
