pragma solidity 0.6.6;

import "../InimbleReserve.sol";
import "../InimbleFeeHandler.sol";

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

    function setContracts(InimbleFeeHandler _feeHandler, address _matchingEngine)
        external
        pure
    {
        _feeHandler;
        _matchingEngine;
    }

    function addnimbleProxy(address networkProxy, uint256 max_approved_proxies)
        external
        pure
    {
        networkProxy;
        max_approved_proxies;
    }

    function removenimbleProxy(address networkProxy) external pure {
        networkProxy;
    }

    function getReservesData(bytes32[] calldata reserveIds, IERC20 , IERC20 )
        external
        view
        returns (
            bool isValid,
            bool[] memory feeAccountedArr,
            bool[] memory entitledRebateArr,
            InimbleReserve[] memory reserveAddresses
            )
    {
        isValid = true;
        reserveIds;
        feeAccountedArr = new bool[](feeArrayLength);
        entitledRebateArr = new bool[](entitledRebateLength);
        reserveAddresses = new InimbleReserve[](reserveAddressesLength);
    }
}
