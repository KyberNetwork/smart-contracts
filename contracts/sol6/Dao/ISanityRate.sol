pragma solidity 0.6.6;


/// @title Sanity Rate check to prevent burning knc with too expensive or cheap price
/// @dev Using ChainLink as the provider for current knc/eth price
interface ISanityRate {
    // return latest rate of knc/eth
    function latestAnswer() external view returns (uint256);
}
