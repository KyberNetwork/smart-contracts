pragma solidity 0.5.11;

import "./utils/Utils4.sol";
import "./IKyberHint.sol";


/**
 *   @title Kyber Hint Handler contract
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
contract KyberHintHandler is IKyberHint, Utils4 {
    /// @notice Parses the hint for a token to ether trade
    /// @param hint The ABI encoded hint, built using the build*Hint functions
    /// @return Returns the decoded token to ether trade hint type, reserve IDs, and splits
    function parseTokenToEthHint(bytes calldata hint)
        external
        view
        returns (
            TradeType tokenToEthType,
            bytes32[] memory tokenToEthReserveIds,
            IKyberReserve[] memory tokenToEthAddresses,
            uint256[] memory tokenToEthSplits
        )
    {
        HintErrors error;

        (tokenToEthType, tokenToEthReserveIds, tokenToEthSplits, error) = parseHint(hint);

        if (error != HintErrors.NoError) throwHintError(error);

        tokenToEthAddresses = new IKyberReserve[](tokenToEthReserveIds.length);

        for (uint256 i = 0; i < tokenToEthReserveIds.length; i++) {
            tokenToEthAddresses[i] = IKyberReserve(
                convertReserveIdToAddress(tokenToEthReserveIds[i])
            );
        }
    }

    /// @notice Parses the hint for a ether to token trade
    /// @param hint The ABI encoded hint, built using the build*Hint functions
    /// @return Returns the decoded ether to token trade hint type, reserve IDs, and splits
    function parseEthToTokenHint(bytes calldata hint)
        external
        view
        returns (
            TradeType ethToTokenType,
            bytes32[] memory ethToTokenReserveIds,
            IKyberReserve[] memory ethToTokenAddresses,
            uint256[] memory ethToTokenSplits
        )
    {
        HintErrors error;

        (ethToTokenType, ethToTokenReserveIds, ethToTokenSplits, error) = parseHint(hint);

        if (error != HintErrors.NoError) throwHintError(error);

        ethToTokenAddresses = new IKyberReserve[](ethToTokenReserveIds.length);

        for (uint256 i = 0; i < ethToTokenReserveIds.length; i++) {
            ethToTokenAddresses[i] = IKyberReserve(
                convertReserveIdToAddress(ethToTokenReserveIds[i])
            );
        }
    }

    /// @notice Parses the hint for a token to token trade
    /// @param hint The ABI encoded hint, built using the build*Hint functions
    /// @return Returns the decoded token to ether and ether to token trade hint type, reserve IDs, and splits
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
        )
    {
        bytes memory t2eHint;
        bytes memory e2tHint;
        HintErrors t2eError;
        HintErrors e2tError;

        (t2eHint, e2tHint) = unpackT2THint(hint);

        (tokenToEthType, tokenToEthReserveIds, tokenToEthSplits, t2eError) = parseHint(t2eHint);
        if (t2eError != HintErrors.NoError) throwHintError(t2eError);

        (ethToTokenType, ethToTokenReserveIds, ethToTokenSplits, e2tError) = parseHint(e2tHint);
        if (e2tError != HintErrors.NoError) throwHintError(e2tError);

        tokenToEthAddresses = new IKyberReserve[](tokenToEthReserveIds.length);
        ethToTokenAddresses = new IKyberReserve[](ethToTokenReserveIds.length);

        for (uint256 i = 0; i < tokenToEthReserveIds.length; i++) {
            tokenToEthAddresses[i] = IKyberReserve(
                convertReserveIdToAddress(tokenToEthReserveIds[i])
            );
        }
        for (uint256 i = 0; i < ethToTokenReserveIds.length; i++) {
            ethToTokenAddresses[i] = IKyberReserve(
                convertReserveIdToAddress(ethToTokenReserveIds[i])
            );
        }
    }

    /// @notice Builds the hint for a token to ether trade
    /// @param tokenToEthType token to ether trade hint type
    /// @param tokenToEthReserveIds token to ether reserve IDs
    /// @param tokenToEthSplits token to ether reserve splits
    /// @return Returns the ABI encoded hint
    function buildTokenToEthHint(
        TradeType tokenToEthType,
        bytes32[] calldata tokenToEthReserveIds,
        uint256[] calldata tokenToEthSplits
    ) external pure returns (bytes memory hint) {
        bytes32[] memory seqT2EReserveIds = ensureReserveIdSeq(tokenToEthReserveIds);

        HintErrors valid = verifyData(tokenToEthType, seqT2EReserveIds, tokenToEthSplits);
        if (valid != HintErrors.NoError) throwHintError(valid);

        hint = abi.encode(tokenToEthType, seqT2EReserveIds, tokenToEthSplits);
    }

    /// @notice Builds the hint for a ether to token trade
    /// @param ethToTokenType ether to token trade hint type
    /// @param ethToTokenReserveIds ether to token reserve IDs
    /// @param ethToTokenSplits ether to token reserve splits
    /// @return Returns the ABI encoded hint
    function buildEthToTokenHint(
        TradeType ethToTokenType,
        bytes32[] calldata ethToTokenReserveIds,
        uint256[] calldata ethToTokenSplits
    ) external pure returns (bytes memory hint) {
        bytes32[] memory seqE2TReserveIds = ensureReserveIdSeq(ethToTokenReserveIds);

        HintErrors valid = verifyData(ethToTokenType, seqE2TReserveIds, ethToTokenSplits);
        if (valid != HintErrors.NoError) throwHintError(valid);

        hint = abi.encode(ethToTokenType, seqE2TReserveIds, ethToTokenSplits);
    }

    /// @notice Builds the hint for a token to token trade
    /// @param tokenToEthType token to ether trade hint type
    /// @param tokenToEthReserveIds token to ether reserve IDs
    /// @param tokenToEthSplits token to ether reserve splits
    /// @param ethToTokenType ether to token trade hint type
    /// @param ethToTokenReserveIds ether to token reserve IDs
    /// @param ethToTokenSplits ether to token reserve splits
    /// @return Returns the ABI encoded hint
    function buildTokenToTokenHint(
        TradeType tokenToEthType,
        bytes32[] calldata tokenToEthReserveIds,
        uint256[] calldata tokenToEthSplits,
        TradeType ethToTokenType,
        bytes32[] calldata ethToTokenReserveIds,
        uint256[] calldata ethToTokenSplits
    ) external pure returns (bytes memory hint) {
        bytes32[] memory seqT2EReserveIds = ensureReserveIdSeq(tokenToEthReserveIds);
        bytes32[] memory seqE2TReserveIds = ensureReserveIdSeq(ethToTokenReserveIds);

        HintErrors validT2E = verifyData(tokenToEthType, seqT2EReserveIds, tokenToEthSplits);
        if (validT2E != HintErrors.NoError) throwHintError(validT2E);

        HintErrors validE2T = verifyData(ethToTokenType, seqE2TReserveIds, ethToTokenSplits);
        if (validE2T != HintErrors.NoError) throwHintError(validE2T);

        bytes memory t2eHint = abi.encode(tokenToEthType, seqT2EReserveIds, tokenToEthSplits);
        bytes memory e2tHint = abi.encode(ethToTokenType, seqE2TReserveIds, ethToTokenSplits);
        hint = abi.encode(t2eHint, e2tHint);
    }

    /// @notice Parses or decodes the token to ether or ether to token bytes hint
    /// @param hint token to ether or ether to token trade hint
    /// @return Returns the trade type, reserve IDs, and reserve splits
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

    /// @notice Unpacks the token to token hint to token to ether and ether to token hints
    /// @param hint token to token trade hint
    /// @return Returns a token to ether hint and ether to token hint in bytes
    function unpackT2THint(bytes memory hint)
        internal
        pure
        returns (bytes memory t2eHint, bytes memory e2tHint)
    {
        (t2eHint, e2tHint) = abi.decode(hint, (bytes, bytes));
    }

    /// @notice Ensures that the reserveIds passed when building hints are in increasing sequence
    /// @param reserveIds Reserve IDs
    /// @return Returns a bytes32[] with reserveIds in increasing sequence
    function ensureReserveIdSeq(bytes32[] memory reserveIds)
        internal
        pure
        returns (bytes32[] memory)
    {
        for (uint256 i = 0; i < reserveIds.length; i++) {
            for (uint256 j = i + 1; j < reserveIds.length; j++) {
                if (uint256(reserveIds[i]) > (uint256(reserveIds[j]))) {
                    bytes32 temp = reserveIds[i];
                    reserveIds[i] = reserveIds[j];
                    reserveIds[j] = temp;
                } else if (reserveIds[i] == reserveIds[j]) {
                    throwHintError(HintErrors.ReserveIdDupError);
                }
            }
        }

        return reserveIds;
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
        if (!(reserveIds.length > 0)) return HintErrors.ReserveIdEmptyError;
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
        if (error == HintErrors.ReserveIdDupError) revert("duplicate reserveId");
        if (error == HintErrors.ReserveIdEmptyError) revert("reserveIds cannot be empty");
        if (error == HintErrors.ReserveIdSplitsError) revert("reserveIds.length != splits.length");
        if (error == HintErrors.TotalBPSError) revert("total BPS != 10000");
        if (error == HintErrors.SplitsNotEmptyError) revert("splits must be empty");
    }

    function convertReserveIdToAddress(bytes32 reserveId) internal view returns (address);

    function convertAddressToReserveId(address reserveAddress) internal view returns (bytes32);
}
