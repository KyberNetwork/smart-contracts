pragma solidity 0.6.6;


/// @title Sanity Rate check to prevent burning NIM with too expensive or cheap price
/// @dev Using ChainLink as the provider for current NIM/eth price
interface ISanityRate {
    // return latest rate of NIM/eth
    function latestAnswer() external view returns (uint256);
}
