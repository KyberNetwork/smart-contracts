pragma solidity 0.6.6;

import "./INimbleHistory.sol";
import "./utils/PermissionGroupsNoModifiers.sol";


/**
 *   @title NimbleHistory contract
 *   The contract provides the following functions for NimbleStorage contract:
 *   - Record contract changes for a set of contracts
 */
contract NimbleHistory is INimbleHistory, PermissionGroupsNoModifiers {
    address public NimbleStorage;
    address[] internal contractsHistory;

    constructor(address _admin) public PermissionGroupsNoModifiers(_admin) {}

    event NimbleStorageUpdated(address newStorage);

    modifier onlyStorage() {
        require(msg.sender == NimbleStorage, "only storage");
        _;
    }

    function setStorageContract(address _NimbleStorage) external {
        onlyAdmin();
        require(_NimbleStorage != address(0), "storage 0");
        emit NimbleStorageUpdated(_NimbleStorage);
        NimbleStorage = _NimbleStorage;
    }

    function saveContract(address _contract) external override onlyStorage {
        if (contractsHistory.length > 0) {
            // if same address, don't do anything
            if (contractsHistory[0] == _contract) return;
            // otherwise, update history
            contractsHistory.push(contractsHistory[0]);
            contractsHistory[0] = _contract;
        } else {
            contractsHistory.push(_contract);
        }
    }

    /// @notice Should be called off chain
    /// @dev Index 0 is currently used contract address, indexes > 0 are older versions
    function getContracts() external override view returns (address[] memory) {
        return contractsHistory;
    }
}
