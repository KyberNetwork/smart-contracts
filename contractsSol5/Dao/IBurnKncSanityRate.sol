pragma solidity 0.5.11;


/// @title Burn Knc Sanity Rate check to prevent burning KNC with too expensive or cheap price
/// @dev Using ChainLink as the provider for current KNC/ETH price
interface IBurnKncSanityRate {
    // return latest rate of KNC/ETH
    function latestAnswer() external view returns (uint);
}
