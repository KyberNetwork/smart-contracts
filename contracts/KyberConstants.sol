pragma solidity ^0.4.18;


import "./ERC20Interface.sol";

/// @title Kyber constants contract
/// @author Ilan Doron

contract KyberConstants {

    ERC20 constant public ETH_TOKEN_ADDRESS = ERC20(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);
    uint  constant PRECISION = (10**18);
}
