
pragma solidity 0.5.11;

import "../IERC20Interface.sol";

contract OtcInterface {
    function getOffer(uint id) external view returns (uint, IERC20, uint, IERC20);
    function getBestOffer(IERC20 sellGem, IERC20 buyGem) external view returns(uint);
    function getWorseOffer(uint id) external view returns(uint);
    function take(bytes32 id, uint128 maxTakeAmount) external;
}
