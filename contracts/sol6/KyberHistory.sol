pragma solidity 0.6.6;

import "./IKyberHistory.sol";
import "./utils/PermissionGroupsNoModifiers.sol";


/**
 *   @title kyberHistory contract
 *   The contract provides the following functions for kyberStorage contract:
 *   - Record contract changes for a set of contracts
 */
contract KyberHistory is IKyberHistory, PermissionGroupsNoModifiers {
    address public kyberStorage;
    address[] internal contractsHistory;

    constructor(address _admin) public PermissionGroupsNoModifiers(_admin) {}

    event KyberStorageUpdated(address newStorage);

    modifier onlyStorage() {
        require(msg.sender == kyberStorage, "only storage");
        _;
    }

    function setStorageContract(address _kyberStorage) external {
        onlyAdmin();
        require(_kyberStorage != address(0), "storage 0");
        emit KyberStorageUpdated(_kyberStorage);
        kyberStorage = _kyberStorage;
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
