pragma solidity 0.6.6;

import "../NimbleHintHandler.sol";


contract MockHintHandler is NimbleHintHandler {
    mapping(bytes32 => address[]) public reserveIdToAddresses;
    mapping(IERC20 => mapping(bytes32 => bool)) internal isListedReserveWithTokenSrc;
    mapping(IERC20 => mapping(bytes32 => bool)) internal isListedReserveWithTokenDest;

    function callHintError(HintErrors error) external pure {
        return throwHintError(error);
    }

    function addReserve(address reserve, bytes32 reserveId) public {
        reserveIdToAddresses[reserveId].push(reserve);
    }

    function listPairForReserve(bytes32 reserveId, IERC20 token) public {
        mapping(bytes32 => bool) storage isListedSrc = isListedReserveWithTokenSrc[token];
        mapping(bytes32 => bool) storage isListedDest = isListedReserveWithTokenDest[token];

        isListedSrc[reserveId] = true;
        isListedDest[reserveId] = true;
    }

    function getReserveAddress(bytes32 reserveId) internal view override returns (address reserveAddress) {
        address[] memory reserveAddresses = reserveIdToAddresses[reserveId];

        if (reserveAddresses.length != 0) {
            reserveAddress = reserveIdToAddresses[reserveId][0];
        }
    }

    function areAllReservesListed(
        bytes32[] memory reserveIds,
        IERC20 src,
        IERC20 dest
    ) internal override view returns (bool) {
        bool result = true;

        mapping(bytes32 => bool) storage isListedReserveWithToken = (dest == ETH_TOKEN_ADDRESS)
            ? isListedReserveWithTokenSrc[src]
            : isListedReserveWithTokenDest[dest];

        for (uint256 i = 0; i < reserveIds.length; i++) {
            if (!isListedReserveWithToken[reserveIds[i]]){
                result = false;
                break;
            }
        }

        return result;
    }
}
