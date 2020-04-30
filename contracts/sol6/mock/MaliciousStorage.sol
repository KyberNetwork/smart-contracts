pragma solidity 0.6.6;

import "../IKyberReserve.sol";


// does not do anything, only return true
contract MaliciousStorage {
    uint public feeArrayLength;
    uint public entitledRebateLength;
    uint public reserveAddressesLength;

    constructor() public {}

    function setArrayLengths(uint _fee, uint _rebate, uint _addresses) external {
        feeArrayLength = _fee;
        entitledRebateLength = _rebate;
        reserveAddressesLength = _addresses;
    }

    function setContracts(address _feeHandler, address _matchingEngine)
        external
        pure
        returns (bool)
    {
        _feeHandler;
        _matchingEngine;
        return true;
    }

    function setDAOContract(address _kyberDAO) external pure returns (bool) {
        _kyberDAO;
        return false;
    }

    function addKyberProxy(address networkProxy, uint256 max_approved_proxies)
        external
        pure
        returns (bool)
    {
        networkProxy;
        max_approved_proxies;
        return true;
    }

    function removeKyberProxy(address networkProxy) external pure returns (bool) {
        networkProxy;
        return true;
    }

    function getReservesData(bytes32[] calldata reserveIds)
        external
        view
        returns (
            bool[] memory feeAccountedArr,
            bool[] memory entitledRebateArr,
            IKyberReserve[] memory reserveAddresses
            )
    {
        reserveIds;
        feeAccountedArr = new bool[](feeArrayLength);
        entitledRebateArr = new bool[](entitledRebateLength);
        reserveAddresses = new IKyberReserve[](reserveAddressesLength);
    }
}
