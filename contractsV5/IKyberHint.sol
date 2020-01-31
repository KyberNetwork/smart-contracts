pragma solidity 0.5.11;

import "./IERC20.sol";


interface IKyberHint {

    enum TradeType {
        MaskIn,
        MaskOut,
        Split
    }

    function parseEthToTokenHint(bytes calldata hint)
        external
        view
        returns(
            TradeType tradeType,
            bytes5[] memory reserveIds,
            uint[] memory splits
        );

    function parseTokenToEthHint(bytes calldata hint)
        external
        view
        returns(
            TradeType tradeType,
            bytes5[] memory reserveIds,
            uint[] memory splits
        );

    function parseTokenToTokenHint(bytes calldata hint)
        external
        view
        returns(
            TradeType tokenToEthType,
            bytes5[] memory tokenToEthReserveIds,
            uint[] memory tokenToEthSplits,
            TradeType ethToTokenType,
            bytes5[] memory ethToTokenReserveIds,
            uint[] memory ethToTokenSplits
        );

    function buildEthToTokenHint(
        TradeType tradeType,
        bytes5[] calldata reserveIds,
        uint[] calldata splits
    )
        external
        view
        returns(bytes memory hint);

    function buildTokenToEthHint(
        TradeType tokenToEthType,
        bytes5[] calldata tokenToEthReserveIds,
        uint[] calldata tokenToEthSplits
    )
        external
        view
        returns(bytes memory hint);

    function buildTokenToTokenHint(
        TradeType tokenToEthType,
        bytes5[] calldata tokenToEthReserveIds,
        uint[] calldata tokenToEthSplits,
        TradeType ethToTokenType,
        bytes5[] calldata ethToTokenReserveIds,
        uint[] calldata ethToTokenSplits
    )
        external
        pure
        returns(bytes memory hint);
}
