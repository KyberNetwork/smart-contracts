pragma solidity 0.6.6;


/*
 * @title ChainLink Sanity Rate
 * @dev Using ChainLink as the provider for current KNC/ETH price
 */
interface ISanityRate {
    // return latest rate, e.g: KNC/ETH rate
    function latestAnswer() external view returns (uint256);
}
