pragma solidity 0.5.11;

import "./IERC20.sol";


interface IKyberNetworkHint {
    function parseHint(bytes hint) external view returns (address[] ethToTokenReserves, );

}
