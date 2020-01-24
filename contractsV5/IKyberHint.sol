pragma solidity 0.5.11;

import "./IERC20.sol";
import "./IKyberReserve.sol";


interface IKyberHint {

    enum HintType {
        MaskIn,
        MaskOut,
        Split
    }

    function parseEthToTokenHint(bytes calldata hint)
        external
        view
        returns(
            HintType hintType,
            bytes3[] memory reserveIds,
            uint[] memory splits,
            uint failingIndex
        );

    function parseTokenToEthHint(bytes calldata hint)
        external
        view
        returns(
            HintType hintType,
            bytes3[] memory reserveIds,
            uint[] memory splits,
            uint failingIndex
        );

    function parseTokenToTokenHint(bytes calldata hint)
        external
        view
        returns(
            HintType tokenToEthType,
            bytes3[] memory tokenToEthReserveIds,
            uint[] memory tokenToEthSplits,
            HintType ethToTokenType,
            bytes3[] memory ethToTokenReserveIds,
            uint[] memory ethToTokenSplits,
            uint failingIndex
        );

    function buildEthToTokenHint(
        HintType hintType,
        bytes3[] calldata reserveIds,
        uint[] calldata splits
    )
        external
        view
        returns(bytes memory hint);

    function buildTokenToEthHint(
        HintType tokenToEthType,
        bytes3[] calldata tokenToEthReserveIds,
        uint[] calldata tokenToEthSplits
    )
        external
        view
        returns(bytes memory hint);

    function buildTokenToTokenHint(
        HintType tokenToEthType,
        bytes3[] calldata tokenToEthReserveIds,
        uint[] calldata tokenToEthSplits,
        HintType ethToTokenType,
        bytes3[] calldata ethToTokenReserveIds,
        uint[] calldata ethToTokenSplits
    )
        external
        pure
        returns(bytes memory hint);

    function reserveAddressToReserveId(address reserveAddress)
        external
        view
        returns (bytes3 reserveId);

    function reserveIdToReserveAddress(bytes3 reserveId)
        external
        view
        returns (address reserveAddress);
}
