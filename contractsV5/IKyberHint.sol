pragma solidity 0.5.11;


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
            bytes8[] memory reserveIds,
            uint[] memory splits
        );

    function parseTokenToEthHint(bytes calldata hint)
        external
        view
        returns(
            TradeType tradeType,
            bytes8[] memory reserveIds,
            uint[] memory splits
        );

    function parseTokenToTokenHint(bytes calldata hint)
        external
        view
        returns(
            TradeType t2eType,
            bytes8[] memory t2eReserveIds,
            uint[] memory t2eSplits,
            TradeType e2tType,
            bytes8[] memory e2tReserveIds,
            uint[] memory e2tSplits
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
