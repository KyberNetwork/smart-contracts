pragma solidity 0.5.11;

import "../KyberHintHandler.sol";


contract MockHintHandler is KyberHintHandler {

    mapping(address=>bytes8) public reserveAddressToId;
    mapping(bytes8=>address[]) public reserveIdToAddresses;

    function addReserve(address reserve, bytes8 reserveId) public {
        reserveIdToAddresses[reserveId].push(reserve);
        reserveAddressToId[reserve] = reserveId;
    }

    function parseEthToTokenHint(bytes calldata hint)
        external
        view
        returns(
            TradeType ethToTokenType,
            bytes8[] memory ethToTokenReserveIds,
            uint[] memory ethToTokenSplits
        )
    {
        IKyberReserve[] memory ethToTokenAddresses;

        (ethToTokenType, ethToTokenAddresses, ethToTokenSplits) = parseHintE2T(hint);

        bytes8[] memory reserveIds = new bytes8[](ethToTokenAddresses.length);

        for (uint i = 0; i < ethToTokenAddresses.length; i++) {
            reserveIds[i] = convertAddressToReserveId(address(ethToTokenAddresses[i]));
        }

        ethToTokenReserveIds = reserveIds;
    }

    function parseTokenToEthHint(bytes calldata hint)
        external
        view
        returns(
            TradeType tokenToEthType,
            bytes8[] memory tokenToEthReserveIds,
            uint[] memory tokenToEthSplits
        )
    {
        IKyberReserve[] memory tokenToEthAddresses;

        (tokenToEthType, tokenToEthAddresses, tokenToEthSplits) = parseHintT2E(hint);

        bytes8[] memory reserveIds = new bytes8[](tokenToEthAddresses.length);

        for (uint i = 0; i < tokenToEthAddresses.length; i++) {
            reserveIds[i] = convertAddressToReserveId(address(tokenToEthAddresses[i]));
        }

        tokenToEthReserveIds = reserveIds;
    }

    function parseTokenToTokenHint(bytes calldata hint)
        external
        view
        returns(
            TradeType tokenToEthType,
            bytes8[] memory tokenToEthReserveIds,
            uint[] memory tokenToEthSplits,
            TradeType ethToTokenType,
            bytes8[] memory ethToTokenReserveIds,
            uint[] memory ethToTokenSplits
        )
    {
        IKyberReserve[] memory tokenToEthAddresses;
        IKyberReserve[] memory ethToTokenAddresses;

        (
            tokenToEthType,
            tokenToEthAddresses,
            tokenToEthSplits,
            ethToTokenType,
            ethToTokenAddresses,
            ethToTokenSplits
        ) = parseHintT2T(hint);

        bytes8[] memory reserveIdsT2E = new bytes8[](tokenToEthAddresses.length);
        bytes8[] memory reserveIdsE2T = new bytes8[](ethToTokenAddresses.length);

        for (uint i = 0; i < tokenToEthAddresses.length; i++) {
            reserveIdsT2E[i] = convertAddressToReserveId(address(tokenToEthAddresses[i]));
        }
        for (uint i = 0; i < ethToTokenAddresses.length; i++) {
            reserveIdsE2T[i] = convertAddressToReserveId(address(ethToTokenAddresses[i]));
        }

        tokenToEthReserveIds = reserveIdsT2E;
        ethToTokenReserveIds = reserveIdsE2T;
    }

    function convertReserveIdToAddress(bytes8 reserveId)
        internal
        view
        returns (address)
    {
        return reserveIdToAddresses[reserveId][0];
    }

    function convertAddressToReserveId(address reserveAddress)
        internal
        view
        returns (bytes8)
    {
        return reserveAddressToId[reserveAddress];
    }
}
