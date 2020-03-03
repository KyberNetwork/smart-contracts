pragma solidity 0.5.11;

import "../KyberMatchingEngine.sol";


contract MockTradeLogic is KyberMatchingEngine {

    mapping(address=>bytes5) public reserveAddressToId;
    mapping(bytes5=>address[]) public reserveIdToAddresses;

    constructor(address _admin) public KyberMatchingEngine(_admin) 
        {}
}
