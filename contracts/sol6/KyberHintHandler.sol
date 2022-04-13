pragma solidity 0.6.6;

import "./utils/Utils5.sol";
import "./INimbleHint.sol";


/**
 *   @title NimbleHintHandler contract
 *   The contract provides the following functionality:
 *       - building hints
 *       - parsing hints
 *
 *       All external functions, build*Hint() and parse*Hint:
 *           - Will revert with error message if an error is found
 *           - parse*Hint() returns both reserveIds and reserveAddresses
 *       Internal functions unpackT2THint() and parseHint():
 *           - Are part of get rate && trade flow
 *           - Don't revert if an error is found
 *           - If an error is found, return no data such that the trade flow
 *             returns 0 rate for bad hint values
 */
abstract contract NimbleHintHandler is INimbleHint, Utils5 {
    /// @notice Parses the hint for a token -> eth trade
    /// @param tokenSrc source token to trade
    /// @param hint The ABI encoded hint, built using the build*Hint functions
    /// @return tokenToEthType Decoded hint type
    /// @return tokenToEthReserveIds Decoded reserve IDs
    /// @return tokenToEthAddresses Reserve addresses corresponding to reserve IDs
    /// @return tokenToEthSplits Decoded splits
    function parseTokenToEthHint(IERC20 tokenSrc, bytes memory hint)
        public
        view
        override
        returns (
            TradeType tokenToEthType,
            bytes32[] memory tokenToEthReserveIds,
            INimbleReserve[] memory tokenToEthAddresses,
            uint256[] memory tokenToEthSplits
        )
    {
        HintErrors error;

        (tokenToEthType, tokenToEthReserveIds, tokenToEthSplits, error) = parseHint(hint);
        if (error != HintErrors.NoError) throwHintError(error);

        if (tokenToEthType == TradeType.MaskIn || tokenToEthType == TradeType.Split) {
            checkTokenListedForReserve(tokenSrc, tokenToEthReserveIds, true);
        }

        tokenToEthAddresses = new INimbleReserve[](tokenToEthReserveIds.length);

        for (uint256 i = 0; i < tokenToEthReserveIds.length; i++) {
            checkReserveIdsExists(tokenToEthReserveIds[i]);
            checkDuplicateReserveIds(tokenToEthReserveIds, i);

            if (i > 0 && tokenToEthType == TradeType.Split) {
                checkSplitReserveIdSeq(tokenToEthReserveIds[i], tokenToEthReserveIds[i - 1]);
            }

            tokenToEthAddresses[i] = INimbleReserve(
                getReserveAddress(tokenToEthReserveIds[i])
            );
        }
    }

    /// @notice Parses the hint for a eth -> token trade
    /// @param tokenDest destination token to trade
    /// @param hint The ABI encoded hint, built using the build*Hint functions
    /// @return ethToTokenType Decoded hint type
    /// @return ethToTokenReserveIds Decoded reserve IDs
    /// @return ethToTokenAddresses Reserve addresses corresponding to reserve IDs
    /// @return ethToTokenSplits Decoded splits
    function parseEthToTokenHint(IERC20 tokenDest, bytes memory hint)
        public
        view
        override
        returns (
            TradeType ethToTokenType,
            bytes32[] memory ethToTokenReserveIds,
            INimbleReserve[] memory ethToTokenAddresses,
            uint256[] memory ethToTokenSplits
        )
    {
        HintErrors error;

        (ethToTokenType, ethToTokenReserveIds, ethToTokenSplits, error) = parseHint(hint);
        if (error != HintErrors.NoError) throwHintError(error);

        if (ethToTokenType == TradeType.MaskIn || ethToTokenType == TradeType.Split) {
            checkTokenListedForReserve(tokenDest, ethToTokenReserveIds, false);
        }

        ethToTokenAddresses = new INimbleReserve[](ethToTokenReserveIds.length);

        for (uint256 i = 0; i < ethToTokenReserveIds.length; i++) {
            checkReserveIdsExists(ethToTokenReserveIds[i]);
            checkDuplicateReserveIds(ethToTokenReserveIds, i);

            if (i > 0 && ethToTokenType == TradeType.Split) {
                checkSplitReserveIdSeq(ethToTokenReserveIds[i], ethToTokenReserveIds[i - 1]);
            }

            ethToTokenAddresses[i] = INimbleReserve(
                getReserveAddress(ethToTokenReserveIds[i])
            );
        }
    }

    /// @notice Parses the hint for a token to token trade
    /// @param tokenSrc source token to trade
    /// @param tokenDest destination token to trade
    /// @param hint The ABI encoded hint, built using the build*Hint functions
    /// @return tokenToEthType Decoded hint type
    /// @return tokenToEthReserveIds Decoded reserve IDs
    /// @return tokenToEthAddresses Reserve addresses corresponding to reserve IDs
    /// @return tokenToEthSplits Decoded splits
    /// @return ethToTokenType Decoded hint type
    /// @return ethToTokenReserveIds Decoded reserve IDs
    /// @return ethToTokenAddresses Reserve addresses corresponding to reserve IDs
    /// @return ethToTokenSplits Decoded splits
    function parseTokenToTokenHint(IERC20 tokenSrc, IERC20 tokenDest, bytes memory hint)
        public
        view
        override
        returns (
            TradeType tokenToEthType,
            bytes32[] memory tokenToEthReserveIds,
            INimbleReserve[] memory tokenToEthAddresses,
            uint256[] memory tokenToEthSplits,
            TradeType ethToTokenType,
            bytes32[] memory ethToTokenReserveIds,
            INimbleReserve[] memory ethToTokenAddresses,
            uint256[] memory ethToTokenSplits
        )
    {
        bytes memory t2eHint;
        bytes memory e2tHint;

        (t2eHint, e2tHint) = unpackT2THint(hint);

        (
            tokenToEthType,
            tokenToEthReserveIds,
            tokenToEthAddresses,
            tokenToEthSplits
        ) = parseTokenToEthHint(tokenSrc, t2eHint);

        (
            ethToTokenType,
            ethToTokenReserveIds,
            ethToTokenAddresses,
            ethToTokenSplits
        ) = parseEthToTokenHint(tokenDest, e2tHint);
    }

    /// @notice Builds the hint for a token -> eth trade
    /// @param tokenSrc source token to trade
    /// @param tokenToEthType token -> eth trade hint type
    /// @param tokenToEthReserveIds token -> eth reserve IDs
    /// @param tokenToEthSplits token -> eth reserve splits
    /// @return hint The ABI encoded hint
    function buildTokenToEthHint(
        IERC20 tokenSrc,
        TradeType tokenToEthType,
        bytes32[] memory tokenToEthReserveIds,
        uint256[] memory tokenToEthSplits
    ) public view override returns (bytes memory hint) {
        for (uint256 i = 0; i < tokenToEthReserveIds.length; i++) {
            checkReserveIdsExists(tokenToEthReserveIds[i]);
        }

        HintErrors valid = verifyData(
            tokenToEthType,
            tokenToEthReserveIds,
            tokenToEthSplits
        );
        if (valid != HintErrors.NoError) throwHintError(valid);

        if (tokenToEthType == TradeType.MaskIn || tokenToEthType == TradeType.Split) {
            checkTokenListedForReserve(tokenSrc, tokenToEthReserveIds, true);
        }

        if (tokenToEthType == TradeType.Split) {
            bytes32[] memory seqT2EReserveIds;
            uint256[] memory seqT2ESplits;

            (seqT2EReserveIds, seqT2ESplits) = ensureSplitSeq(
                tokenToEthReserveIds,
                tokenToEthSplits
            );

            hint = abi.encode(tokenToEthType, seqT2EReserveIds, seqT2ESplits);
        } else {
            hint = abi.encode(tokenToEthType, tokenToEthReserveIds, tokenToEthSplits);
        }
    }

    /// @notice Builds the hint for a eth -> token trade
    /// @param tokenDest destination token to trade
    /// @param ethToTokenType eth -> token trade hint type
    /// @param ethToTokenReserveIds eth -> token reserve IDs
    /// @param ethToTokenSplits eth -> token reserve splits
    /// @return hint The ABI encoded hint
    function buildEthToTokenHint(
        IERC20 tokenDest,
        TradeType ethToTokenType,
        bytes32[] memory ethToTokenReserveIds,
        uint256[] memory ethToTokenSplits
    ) public view override returns (bytes memory hint) {
        for (uint256 i = 0; i < ethToTokenReserveIds.length; i++) {
            checkReserveIdsExists(ethToTokenReserveIds[i]);
        }

        HintErrors valid = verifyData(
            ethToTokenType,
            ethToTokenReserveIds,
            ethToTokenSplits
        );
        if (valid != HintErrors.NoError) throwHintError(valid);

        if (ethToTokenType == TradeType.MaskIn || ethToTokenType == TradeType.Split) {
            checkTokenListedForReserve(tokenDest, ethToTokenReserveIds, false);
        }

        if (ethToTokenType == TradeType.Split) {
            bytes32[] memory seqE2TReserveIds;
            uint256[] memory seqE2TSplits;

            (seqE2TReserveIds, seqE2TSplits) = ensureSplitSeq(
                ethToTokenReserveIds,
                ethToTokenSplits
            );

            hint = abi.encode(ethToTokenType, seqE2TReserveIds, seqE2TSplits);
        } else {
            hint = abi.encode(ethToTokenType, ethToTokenReserveIds, ethToTokenSplits);
        }
    }

    /// @notice Builds the hint for a token to token trade
    /// @param tokenSrc source token to trade
    /// @param tokenToEthType token -> eth trade hint type
    /// @param tokenToEthReserveIds token -> eth reserve IDs
    /// @param tokenToEthSplits token -> eth reserve splits
    /// @param tokenDest destination token to trade
    /// @param ethToTokenType eth -> token trade hint type
    /// @param ethToTokenReserveIds eth -> token reserve IDs
    /// @param ethToTokenSplits eth -> token reserve splits
    /// @return hint The ABI encoded hint
    function buildTokenToTokenHint(
        IERC20 tokenSrc,
        TradeType tokenToEthType,
        bytes32[] memory tokenToEthReserveIds,
        uint256[] memory tokenToEthSplits,
        IERC20 tokenDest,
        TradeType ethToTokenType,
        bytes32[] memory ethToTokenReserveIds,
        uint256[] memory ethToTokenSplits
    ) public view override returns (bytes memory hint) {
        bytes memory t2eHint = buildTokenToEthHint(
            tokenSrc,
            tokenToEthType,
            tokenToEthReserveIds,
            tokenToEthSplits
        );

        bytes memory e2tHint = buildEthToTokenHint(
            tokenDest,
            ethToTokenType,
            ethToTokenReserveIds,
            ethToTokenSplits
        );

        hint = abi.encode(t2eHint, e2tHint);
    }

    /// @notice Parses or decodes the token -> eth or eth -> token bytes hint
    /// @param hint token -> eth or eth -> token trade hint
    /// @return tradeType Decoded hint type
    /// @return reserveIds Decoded reserve IDs
    /// @return splits Reserve addresses corresponding to reserve IDs
    /// @return valid Whether the decoded is valid
    function parseHint(bytes memory hint)
        internal
        pure
        returns (
            TradeType tradeType,
            bytes32[] memory reserveIds,
            uint256[] memory splits,
            HintErrors valid
        )
    {
        (tradeType, reserveIds, splits) = abi.decode(hint, (TradeType, bytes32[], uint256[])); // solhint-disable
        valid = verifyData(tradeType, reserveIds, splits);

        if (valid != HintErrors.NoError) {
            reserveIds = new bytes32[](0);
            splits = new uint256[](0);
        }
    }

    /// @notice Unpacks the token to token hint to token -> eth and eth -> token hints
    /// @param hint token to token trade hint
    /// @return t2eHint The ABI encoded token -> eth hint
    /// @return e2tHint The ABI encoded eth -> token hint
    function unpackT2THint(bytes memory hint)
        internal
        pure
        returns (bytes memory t2eHint, bytes memory e2tHint)
    {
        (t2eHint, e2tHint) = abi.decode(hint, (bytes, bytes));
    }

    /// @notice Checks if the reserveId exists
    /// @param reserveId Reserve ID to check
    function checkReserveIdsExists(bytes32 reserveId)
        internal
        view
    {
        if (getReserveAddress(reserveId) == address(0))
            throwHintError(HintErrors.ReserveIdNotFound);
    }

    /// @notice Checks that the token is listed for the reserves
    /// @param token ERC20 token
    /// @param reserveIds Reserve IDs
    /// @param isTokenToEth Flag to indicate token -> eth or eth -> token
    function checkTokenListedForReserve(
        IERC20 token,
        bytes32[] memory reserveIds,
        bool isTokenToEth
    ) internal view {
        IERC20 src = (isTokenToEth) ? token : ETH_TOKEN_ADDRESS;
        IERC20 dest = (isTokenToEth) ? ETH_TOKEN_ADDRESS : token;

        if (!areAllReservesListed(reserveIds, src, dest))
            throwHintError(HintErrors.TokenListedError);
    }

    /// @notice Ensures that the reserveIds in the hint to be parsed has no duplicates
    /// and applies to all trade types
    /// @param reserveIds Array of reserve IDs
    /// @param i Starting index from outer loop
    function checkDuplicateReserveIds(bytes32[] memory reserveIds, uint256 i)
        internal
        pure
    {
        for (uint256 j = i + 1; j < reserveIds.length; j++) {
            if (uint256(reserveIds[i]) == uint256(reserveIds[j])) {
                throwHintError(HintErrors.ReserveIdDupError);
            }
        }
    }

    /// @notice Ensures that the reserveIds in the hint to be parsed is in
    /// sequence for and applies to only Split trade type
    /// @param reserveId Current index Reserve ID in array
    /// @param prevReserveId Previous index Reserve ID in array
    function checkSplitReserveIdSeq(bytes32 reserveId, bytes32 prevReserveId)
        internal
        pure
    {
        if (uint256(reserveId) <= uint256(prevReserveId)) {
            throwHintError(HintErrors.ReserveIdSequenceError);
        }
    }

    /// @notice Ensures that the reserveIds and splits passed when building Split hints are in increasing sequence
    /// @param reserveIds Reserve IDs
    /// @param splits Reserve splits
    /// @return Returns a bytes32[] with reserveIds in increasing sequence and respective arranged splits
    function ensureSplitSeq(
        bytes32[] memory reserveIds,
        uint256[] memory splits
    )
        internal
        pure
        returns (bytes32[] memory, uint256[] memory)
    {
        for (uint256 i = 0; i < reserveIds.length; i++) {
            for (uint256 j = i + 1; j < reserveIds.length; j++) {
                if (uint256(reserveIds[i]) > (uint256(reserveIds[j]))) {
                    bytes32 tempId = reserveIds[i];
                    uint256 tempSplit = splits[i];

                    reserveIds[i] = reserveIds[j];
                    reserveIds[j] = tempId;
                    splits[i] = splits[j];
                    splits[j] = tempSplit;
                } else if (reserveIds[i] == reserveIds[j]) {
                    throwHintError(HintErrors.ReserveIdDupError);
                }
            }
        }

        return (reserveIds, splits);
    }

    /// @notice Ensures that the data passed when building/parsing hints is valid
    /// @param tradeType Trade hint type
    /// @param reserveIds Reserve IDs
    /// @param splits Reserve splits
    /// @return Returns a HintError enum to indicate valid or invalid hint data
    function verifyData(
        TradeType tradeType,
        bytes32[] memory reserveIds,
        uint256[] memory splits
    ) internal pure returns (HintErrors) {
        if (tradeType == TradeType.BestOfAll) {
            if (reserveIds.length != 0 || splits.length != 0) return HintErrors.NonEmptyDataError;
        }

        if (
            (tradeType == TradeType.MaskIn || tradeType == TradeType.Split) &&
            reserveIds.length == 0
        ) return HintErrors.ReserveIdEmptyError;

        if (tradeType == TradeType.Split) {
            if (reserveIds.length != splits.length) return HintErrors.ReserveIdSplitsError;

            uint256 bpsSoFar;
            for (uint256 i = 0; i < splits.length; i++) {
                bpsSoFar += splits[i];
            }

            if (bpsSoFar != BPS) return HintErrors.TotalBPSError;
        } else {
            if (splits.length != 0) return HintErrors.SplitsNotEmptyError;
        }

        return HintErrors.NoError;
    }

    /// @notice Throws error message to user to indicate error on hint
    /// @param error Error type from HintErrors enum
    function throwHintError(HintErrors error) internal pure {
        if (error == HintErrors.NonEmptyDataError) revert("reserveIds and splits must be empty");
        if (error == HintErrors.ReserveIdDupError) revert("duplicate reserveId");
        if (error == HintErrors.ReserveIdEmptyError) revert("reserveIds cannot be empty");
        if (error == HintErrors.ReserveIdSplitsError) revert("reserveIds.length != splits.length");
        if (error == HintErrors.ReserveIdSequenceError) revert("reserveIds not in increasing order");
        if (error == HintErrors.ReserveIdNotFound) revert("reserveId not found");
        if (error == HintErrors.SplitsNotEmptyError) revert("splits must be empty");
        if (error == HintErrors.TokenListedError) revert("token is not listed for reserveId");
        if (error == HintErrors.TotalBPSError) revert("total BPS != 10000");
    }

    function getReserveAddress(bytes32 reserveId) internal view virtual returns (address);

    function areAllReservesListed(
        bytes32[] memory reserveIds,
        IERC20 src,
        IERC20 dest
    ) internal virtual view returns (bool);
}
