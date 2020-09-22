pragma solidity 0.6.6;

import "../../../utils/Withdrawable3.sol";
import "../../../IERC20.sol";


contract MockSimpleStorage is Withdrawable3 {
    mapping(bytes32 => address[]) public reserves;

    constructor(address _admin) public Withdrawable3(_admin) {}

    function listPairForReserve(
        bytes32 /* reserveId */,
        IERC20 /* token */,
        bool /* ethToToken */,
        bool /* tokenToEth */,
        bool /* add */
    ) external onlyOperator {
    }

    function addReserve(bytes32 reserveId, address reserve) external {
        if (reserves[reserveId].length > 0) {
            // replace
            reserves[reserveId][0] = reserve;
        } else {
            reserves[reserveId].push(reserve);
        }
    }
    function getReserveAddressesByReserveId(bytes32 reserveId)
        external
        view
        returns (address[] memory reserveAddresses)
    {
        reserveAddresses = reserves[reserveId];
    }
}

