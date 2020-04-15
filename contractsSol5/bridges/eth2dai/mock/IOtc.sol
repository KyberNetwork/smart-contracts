pragma solidity 0.5.11;

import "../../../IERC20.sol";


contract IOtc {
    function getOffer(uint256 id)
        external
        view
        returns (
            uint256,
            IERC20,
            uint256,
            IERC20
        );

    function getBestOffer(IERC20 sellGem, IERC20 buyGem)
        external
        view
        returns (uint256);

    function getWorseOffer(uint256 id) external view returns (uint256);

    function take(bytes32 id, uint128 maxTakeAmount) external;
}
