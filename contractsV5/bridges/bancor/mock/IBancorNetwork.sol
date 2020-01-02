pragma solidity 0.5.11;

import "../../../IERC20.sol";

contract IBancorNetwork {
    // to get rate, return dest amount + fee amount
    function getReturnByPath(IERC20[] calldata _path, uint256 _amount) external view returns (uint256, uint256);
    // to convert ETH to token, return dest amount
    function convert2(
        IERC20[] calldata _path,
        uint256 _amount,
        uint256 _minReturn,
        address _affiliateAccount,
        uint256 _affiliateFee
    ) external payable returns (uint256);

    // to convert token to ETH, return dest amount
    function claimAndConvert2(
        IERC20[] calldata _path,
        uint256 _amount,
        uint256 _minReturn,
        address _affiliateAccount,
        uint256 _affiliateFee
    ) external returns (uint256);
}
