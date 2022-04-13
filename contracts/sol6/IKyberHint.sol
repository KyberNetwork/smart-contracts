pragma solidity 0.6.6;

import "./INimbleReserve.sol";


interface INimbleHint {
    enum TradeType {BestOfAll, MaskIn, MaskOut, Split}
    enum HintErrors {
        NoError, // Hint is valid
        NonEmptyDataError, // reserveIDs and splits must be empty for BestOfAll hint
        ReserveIdDupError, // duplicate reserveID found
        ReserveIdEmptyError, // reserveIDs array is empty for MaskIn and Split trade type
        ReserveIdSplitsError, // reserveIDs and splitBpsValues arrays do not have the same length
        ReserveIdSequenceError, // reserveID sequence in array is not in increasing order
        ReserveIdNotFound, // reserveID isn't registered or doesn't exist
        SplitsNotEmptyError, // splitBpsValues is not empty for MaskIn or MaskOut trade type
        TokenListedError, // reserveID not listed for the token
        TotalBPSError // total BPS for Split trade type is not 10000 (100%)
    }

    function buildTokenToEthHint(
        IERC20 tokenSrc,
        TradeType tokenToEthType,
        bytes32[] calldata tokenToEthReserveIds,
        uint256[] calldata tokenToEthSplits
    ) external view returns (bytes memory hint);

    function buildEthToTokenHint(
        IERC20 tokenDest,
        TradeType ethToTokenType,
        bytes32[] calldata ethToTokenReserveIds,
        uint256[] calldata ethToTokenSplits
    ) external view returns (bytes memory hint);

    function buildTokenToTokenHint(
        IERC20 tokenSrc,
        TradeType tokenToEthType,
        bytes32[] calldata tokenToEthReserveIds,
        uint256[] calldata tokenToEthSplits,
        IERC20 tokenDest,
        TradeType ethToTokenType,
        bytes32[] calldata ethToTokenReserveIds,
        uint256[] calldata ethToTokenSplits
    ) external view returns (bytes memory hint);

    function parseTokenToEthHint(IERC20 tokenSrc, bytes calldata hint)
        external
        view
        returns (
            TradeType tokenToEthType,
            bytes32[] memory tokenToEthReserveIds,
            INimbleReserve[] memory tokenToEthAddresses,
            uint256[] memory tokenToEthSplits
        );

    function parseEthToTokenHint(IERC20 tokenDest, bytes calldata hint)
        external
        view
        returns (
            TradeType ethToTokenType,
            bytes32[] memory ethToTokenReserveIds,
            INimbleReserve[] memory ethToTokenAddresses,
            uint256[] memory ethToTokenSplits
        );

    function parseTokenToTokenHint(IERC20 tokenSrc, IERC20 tokenDest, bytes calldata hint)
        external
        view
        returns (
            TradeType tokenToEthType,
            bytes32[] memory tokenToEthReserveIds,
            INimbleReserve[] memory tokenToEthAddresses,
            uint256[] memory tokenToEthSplits,
            TradeType ethToTokenType,
            bytes32[] memory ethToTokenReserveIds,
            INimbleReserve[] memory ethToTokenAddresses,
            uint256[] memory ethToTokenSplits
        );
}
