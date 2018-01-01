pragma solidity ^0.4.18;


import "./ERC20Interface.sol";

/// @title Kyber constants contract

contract KyberConstants {

    ERC20 constant public ETH_TOKEN_ADDRESS = ERC20(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);
    uint  constant PRECISION = (10**18);
    uint  constant MAX_QTY   = (10**28); // 1B tokens
    uint  constant MAX_RATE  = (PRECISION * 10**6); // up to 1M tokens per ETH
    uint  constant MAX_DECIMALS = 18;
}
