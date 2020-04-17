pragma solidity 0.5.11;

import "./IKyberReserve.sol";


interface IKyberHint {
    enum TradeType {MaskIn, MaskOut, Split}
    enum HintErrors {
        NoError,
        ReserveIdDupError,
        ReserveIdEmptyError,
        ReserveIdSplitsError,
        SplitsNotEmptyError,
        TotalBPSError
    }

    function parseTokenToEthHint(bytes calldata hint)
        external
        view
        returns (
            TradeType tokenToEthType,
            bytes32[] memory tokenToEthReserveIds,
            IKyberReserve[] memory tokenToEthAddresses,
            uint256[] memory tokenToEthSplits
        );

    function parseEthToTokenHint(bytes calldata hint)
        external
        view
        returns (
            TradeType ethToTokenType,
            bytes32[] memory ethToTokenReserveIds,
            IKyberReserve[] memory ethToTokenAddresses,
            uint256[] memory ethToTokenSplits
        );

    function parseTokenToTokenHint(bytes calldata hint)
        external
        view
        returns (
            TradeType tokenToEthType,
            bytes32[] memory tokenToEthReserveIds,
            IKyberReserve[] memory tokenToEthAddresses,
            uint256[] memory tokenToEthSplits,
            TradeType ethToTokenType,
            bytes32[] memory ethToTokenReserveIds,
            IKyberReserve[] memory ethToTokenAddresses,
            uint256[] memory ethToTokenSplits
        );

    function buildTokenToEthHint(
        TradeType tokenToEthType,
        bytes32[] calldata tokenToEthReserveIds,
        uint256[] calldata tokenToEthSplits
    ) external pure returns (bytes memory hint);

    function buildEthToTokenHint(
        TradeType ethToTokenType,
        bytes32[] calldata ethToTokenReserveIds,
        uint256[] calldata ethToTokenSplits
    ) external pure returns (bytes memory hint);

    function buildTokenToTokenHint(
        TradeType tokenToEthType,
        bytes32[] calldata tokenToEthReserveIds,
        uint256[] calldata tokenToEthSplits,
        TradeType ethToTokenType,
        bytes32[] calldata ethToTokenReserveIds,
        uint256[] calldata ethToTokenSplits
    ) external pure returns (bytes memory hint);
}
