pragma solidity 0.5.11;

import "../KyberMatchingEngine.sol";


/**
 *    @dev MockMatchEngine is a mock for testing overflow
 */

contract MockMatchEngine is KyberMatchingEngine {

    constructor(address _admin) public KyberMatchingEngine(_admin) {}
}
