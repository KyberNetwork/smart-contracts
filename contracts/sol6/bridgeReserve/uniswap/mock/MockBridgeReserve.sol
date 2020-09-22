pragma solidity 0.6.6;

import "../../../utils/Withdrawable3.sol";
import "../../../IERC20.sol";


contract MockBridgeReserve is Withdrawable3 {
    mapping(IERC20 => bool) public tokenListed;

    constructor(address _admin) public Withdrawable3(_admin) {}

    function listToken(
        IERC20 token,
        bool /* addDefaultPaths */,
        bool /* validate */
    ) external onlyOperator {
        tokenListed[token] = true;
    }

    function delistToken(IERC20 token) external onlyOperator {
        tokenListed[token] = false;
    }
}
