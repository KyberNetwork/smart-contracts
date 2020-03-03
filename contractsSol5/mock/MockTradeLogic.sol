pragma solidity 0.5.11;

import "../KyberTradeLogic.sol";


contract MockTradeLogic is KyberTradeLogic {

    mapping(address=>bytes5) public reserveAddressToId;
    mapping(bytes5=>address[]) public reserveIdToAddresses;

    constructor(address _admin) public KyberTradeLogic(_admin) 
        {}
}
