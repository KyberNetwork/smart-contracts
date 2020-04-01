pragma solidity 0.5.11;

import "./utils/Utils4.sol";
import "./IKyberHint.sol";


/*
*   @title Kyber Hint Handler contract
*   The contract provides the following actions:
*       - building hints
*       - parsing hints
*
*       All external functions, build*Hint() and parse*Hint:
*           - Will revert with error message if an error is found
*           - parse*Hint() returns both reserveIds and reserveAddresses
*       Internal functions unpackT2THint() and parseHint():
*           - Is part of trade flow
*           - Doesn't revert if error is found
*           - If error is found, return no data such that the trade flow
*             returns 0 rate for bad hint values
*/
contract KyberHintHandler is IKyberHint, Utils4 {
 
    /// @notice Builds the hint for a Token to ETH trade
    /// @param tokenToEthType Token to ETH trade hint type
    /// @param tokenToEthReserveIds Token to ETH reserve IDs
    /// @param tokenToEthSplits Token to ETH reserve splits
    /// @return returns the ABI encoded hint
    function buildTokenToEthHint(
        TradeType tokenToEthType,
        bytes32[] calldata tokenToEthReserveIds,
        uint[] calldata tokenToEthSplits
    )
        external
        pure
        returns(bytes memory hint)
    {
        bytes32[] memory seqT2EReserveIds = ensureReserveIdSeq(tokenToEthReserveIds);

        HintErrors valid = verifyData(tokenToEthType, seqT2EReserveIds, tokenToEthSplits);
        if (valid != HintErrors.NoError) throwHintError(valid);

        hint = abi.encode(
            tokenToEthType,
            seqT2EReserveIds,
            tokenToEthSplits
        );
    }

    /// @notice Builds the hint for a ETH to Token trade
    /// @param ethToTokenType ETH to Token trade hint type
    /// @param ethToTokenReserveIds ETH to Token reserve IDs
    /// @param ethToTokenSplits ETH to Token reserve splits
    /// @return returns the ABI encoded hint
    function buildEthToTokenHint(
        TradeType ethToTokenType,
        bytes32[] calldata ethToTokenReserveIds,
        uint[] calldata ethToTokenSplits
    )
        external
        pure
        returns(bytes memory hint)
    {
        bytes32[] memory seqE2TReserveIds = ensureReserveIdSeq(ethToTokenReserveIds);

        HintErrors valid = verifyData(ethToTokenType, seqE2TReserveIds, ethToTokenSplits);
        if (valid != HintErrors.NoError) throwHintError(valid);

        hint = abi.encode(
            ethToTokenType,
            seqE2TReserveIds,
            ethToTokenSplits
        );
    }

    /// @notice Builds the hint for a Token to Token trade
    /// @param tokenToEthType Token to ETH trade hint type
    /// @param tokenToEthReserveIds Token to ETH reserve IDs
    /// @param tokenToEthSplits Token to ETH reserve splits
    /// @param ethToTokenType ETH to Token trade hint type
    /// @param ethToTokenReserveIds ETH to Token reserve IDs
    /// @param ethToTokenSplits ETH to Token reserve splits
    /// @return returns the ABI encoded hint
    function buildTokenToTokenHint(
        TradeType tokenToEthType,
        bytes32[] calldata tokenToEthReserveIds,
        uint[] calldata tokenToEthSplits,
        TradeType ethToTokenType,
        bytes32[] calldata ethToTokenReserveIds,
        uint[] calldata ethToTokenSplits
    )
        external
        pure
        returns(bytes memory hint)
    {
        bytes32[] memory seqT2EReserveIds = ensureReserveIdSeq(tokenToEthReserveIds);
        bytes32[] memory seqE2TReserveIds = ensureReserveIdSeq(ethToTokenReserveIds);

        HintErrors validT2E = verifyData(tokenToEthType, seqT2EReserveIds, tokenToEthSplits);
        if (validT2E != HintErrors.NoError) throwHintError(validT2E);

        HintErrors validE2T = verifyData(ethToTokenType, seqE2TReserveIds, ethToTokenSplits);
        if (validE2T != HintErrors.NoError) throwHintError(validE2T);

        bytes memory t2eHint = abi.encode(
            tokenToEthType,
            seqT2EReserveIds,
            tokenToEthSplits
        );
        bytes memory e2tHint = abi.encode(
            ethToTokenType,
            seqE2TReserveIds,
            ethToTokenSplits
        );
        hint = abi.encode(t2eHint, e2tHint);
    }

    /// @notice Parses the hint for a Token to ETH trade
    /// @param hint The ABI encoded hint, built using the build*Hint functions
    /// @return returns the decoded Token to ETH trade hint type, reserve IDs, and splits
    function parseTokenToEthHint(bytes calldata hint)
        external
        view
        returns(
            TradeType tokenToEthType,
            bytes32[] memory tokenToEthReserveIds,
            IKyberReserve[] memory tokenToEthAddresses,
            uint[] memory tokenToEthSplits
        )
    {
        HintErrors error;

        (tokenToEthType, tokenToEthReserveIds, tokenToEthSplits, error) = parseHint(hint);

        if (error != HintErrors.NoError) throwHintError(error);

        tokenToEthAddresses = new IKyberReserve[](tokenToEthReserveIds.length);

        for (uint i = 0; i < tokenToEthReserveIds.length; i++) {
            tokenToEthAddresses[i] = IKyberReserve(convertReserveIdToAddress(tokenToEthReserveIds[i]));
        }
    }

    /// @notice Parses the hint for a ETH to Token trade
    /// @param hint The ABI encoded hint, built using the build*Hint functions
    /// @return returns the decoded ETH to Token trade hint type, reserve IDs, and splits
    function parseEthToTokenHint(bytes calldata hint)
        external
        view
        returns(
            TradeType ethToTokenType,
            bytes32[] memory ethToTokenReserveIds,
            IKyberReserve[] memory ethToTokenAddresses,
            uint[] memory ethToTokenSplits
        )
    {
        HintErrors error;

        (ethToTokenType, ethToTokenReserveIds, ethToTokenSplits, error) = parseHint(hint);

        if (error != HintErrors.NoError) throwHintError(error);

        ethToTokenAddresses = new IKyberReserve[](ethToTokenReserveIds.length);

        for (uint i = 0; i < ethToTokenReserveIds.length; i++) {
            ethToTokenAddresses[i] = IKyberReserve(convertReserveIdToAddress(ethToTokenReserveIds[i]));
        }
    }

    /// @notice Parses the hint for a Token to Token trade
    /// @param hint The ABI encoded hint, built using the build*Hint functions
    /// @return returns the decoded Token to ETH and ETH to Token trade hint type, reserve IDs, and splits
    function parseTokenToTokenHint(bytes calldata hint)
        external
        view
        returns(
            TradeType tokenToEthType,
            bytes32[] memory tokenToEthReserveIds,
            IKyberReserve[] memory tokenToEthAddresses,
            uint[] memory tokenToEthSplits,
            TradeType ethToTokenType,
            bytes32[] memory ethToTokenReserveIds,
            IKyberReserve[] memory ethToTokenAddresses,
            uint[] memory ethToTokenSplits
        )
    {
        bytes memory t2eHint;
        bytes memory e2tHint;
        HintErrors t2eError;
        HintErrors e2tError;

        (t2eHint, e2tHint) = unpackT2THint(hint);

        (
            tokenToEthType,
            tokenToEthReserveIds,
            tokenToEthSplits,
            t2eError
        ) = parseHint(t2eHint);
        if (t2eError != HintErrors.NoError) throwHintError(t2eError);

        (
            ethToTokenType,
            ethToTokenReserveIds,
            ethToTokenSplits,
            e2tError
        ) = parseHint(e2tHint);
        if (e2tError != HintErrors.NoError) throwHintError(e2tError);

        tokenToEthAddresses = new IKyberReserve[](tokenToEthReserveIds.length);
        ethToTokenAddresses = new IKyberReserve[](ethToTokenReserveIds.length);

        for (uint i = 0; i < tokenToEthReserveIds.length; i++) {
            tokenToEthAddresses[i] = IKyberReserve(convertReserveIdToAddress(tokenToEthReserveIds[i]));
        }
        for (uint i = 0; i < ethToTokenReserveIds.length; i++) {
            ethToTokenAddresses[i] = IKyberReserve(convertReserveIdToAddress(ethToTokenReserveIds[i]));
        }
    }

    /// @notice Parses or decodes the Token to ETH or ETH to Token bytes hint
    /// @param hint Token to ETH or ETH to Token trade hint
    /// @return returns the trade type, reserve IDs, and reserve splits
    function parseHint(bytes memory hint)
        internal
        pure
        returns(
            TradeType tradeType,
            bytes32[] memory reserveIds,
            uint[] memory splits,
            HintErrors valid
        )
    {
        (tradeType, reserveIds, splits) = abi.decode(hint, (TradeType, bytes32[], uint[]));
        valid = verifyData(tradeType, reserveIds, splits);

        if (valid == HintErrors.NoError) {
            reserveIds = new bytes32[](reserveIds.length);
        } else {
            splits = new uint[](0);
        }
    }

    /// @notice Unpacks the Token to Token hint to Token to ETH and ETH to Token hints
    /// @param hint Token to Token trade hint
    /// @return returns a Token to ETH hint and ETH to Token hint in bytes
    function unpackT2THint(bytes memory hint)
        internal
        pure
        returns(
            bytes memory t2eHint,
            bytes memory e2tHint
        )
    {
        (t2eHint, e2tHint) = abi.decode(hint, (bytes, bytes));
    }

    /// @notice Ensures that the reserveIds passed when building hints are in increasing sequence
    /// @param reserveIds Reserve IDs
    /// @return returns a bytes32[] with reserveIds in increasing sequence
    function ensureReserveIdSeq(
        bytes32[] memory reserveIds
    )
        internal
        pure
        returns (bytes32[] memory)
    {
        for(uint i = 0; i < reserveIds.length; i++) {
            for (uint j = i+1; j < reserveIds.length; j++) {
                if (uint(reserveIds[i]) > (uint(reserveIds[j]))) {
                    bytes32 temp = reserveIds[i];
                    reserveIds[i] = reserveIds[j];
                    reserveIds[j] = temp;
                }
            }
        }

        return reserveIds;
    }

    /// @notice Ensures that the data passed when building/parsing hints is valid
    /// @param tradeType Trade hint type
    /// @param reserveIds Reserve IDs
    /// @param splits Reserve splits
    /// @return returns a HintError enum to indicate valid or invalid hint data
    function verifyData(
        TradeType tradeType,
        bytes32[] memory reserveIds,
        uint[] memory splits
    )
        internal
        pure
        returns (HintErrors)
    {
        if (!(reserveIds.length > 0)) return HintErrors.ReserveIdEmptyError;
        if (tradeType == TradeType.Split) {
            if (reserveIds.length != splits.length) return HintErrors.ReserveIdSplitsError;

            uint bpsSoFar;
            for (uint i = 0; i < splits.length; i++) {
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
        if (error == HintErrors.ReserveIdEmptyError)
            revert("reserveIds cannot be empty");
        if (error == HintErrors.ReserveIdSplitsError)
            revert("reserveIds.length != splits.length");
        if (error == HintErrors.TotalBPSError)
            revert("total BPS != 10000");
        if (error == HintErrors.SplitsNotEmptyError)
            revert("splits must be empty");
    }

    function convertReserveIdToAddress(bytes32 reserveId) internal view returns (address);
    function convertAddressToReserveId(address reserveAddress) internal view returns (bytes32);
}
