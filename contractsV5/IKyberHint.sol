pragma solidity 0.5.11;

import "./IKyberReserve.sol";


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
            IKyberReserve[] memory reserveIds,
            uint[] memory splits,
            uint failingIndex
        );

    function parseTokenToEthHint(bytes calldata hint)
        external
        view
        returns(
            TradeType tradeType,
            IKyberReserve[] memory reserveIds,
            uint[] memory splits,
            uint failingIndex
        );

    function parseTokenToTokenHint(bytes calldata hint)
        external
        view
        returns(
            TradeType tokenToEthType,
            IKyberReserve[] memory tokenToEthReserveIds,
            uint[] memory tokenToEthSplits,
            TradeType ethToTokenType,
            IKyberReserve[] memory ethToTokenReserveIds,
            uint[] memory ethToTokenSplits,
            uint failingIndex
        );

    function buildEthToTokenHint(
        TradeType tradeType,
        bytes8[] calldata reserveIds,
        uint[] calldata splits
    )
        external
        pure
        returns(bytes memory hint);

    function buildTokenToEthHint(
        TradeType tokenToEthType,
        bytes8[] calldata tokenToEthReserveIds,
        uint[] calldata tokenToEthSplits
    )
        external
        pure
        returns(bytes memory hint);

    function buildTokenToTokenHint(
        TradeType tokenToEthType,
        bytes8[] calldata tokenToEthReserveIds,
        uint[] calldata tokenToEthSplits,
        TradeType ethToTokenType,
        bytes8[] calldata ethToTokenReserveIds,
        uint[] calldata ethToTokenSplits
    )
        external
        pure
        returns(bytes memory hint);
}
