pragma solidity 0.5.11;

import "./utils/Utils4.sol";
import "./IKyberHint.sol";


contract KyberHintHandler is IKyberHint, Utils4 {
 
    /// @notice Builds the hint for a Token to ETH trade
    /// @param tokenToEthType Token to ETH trade hint type
    /// @param tokenToEthReserveIds Token to ETH reserve IDs
    /// @param tokenToEthSplits Token to ETH reserve splits
    /// @return returns the ABI encoded hint
    function buildTokenToEthHint(
        TradeType tokenToEthType,
        bytes8[] calldata tokenToEthReserveIds,
        uint[] calldata tokenToEthSplits
    )
        external
        pure
        returns(bytes memory hint)
    {
        HintErrors verified = verifyData(tokenToEthType, tokenToEthReserveIds, tokenToEthSplits);

        if (verified == HintErrors.NoError) {
            hint = abi.encode(
                tokenToEthType,
                tokenToEthReserveIds,
                tokenToEthSplits
            );
        } else {
            throwHintError(verified);
        }
    }

    /// @notice Builds the hint for a ETH to Token trade
    /// @param ethToTokenType ETH to Token trade hint type
    /// @param ethToTokenReserveIds ETH to Token reserve IDs
    /// @param ethToTokenSplits ETH to Token reserve splits
    /// @return returns the ABI encoded hint
    function buildEthToTokenHint(
        TradeType ethToTokenType,
        bytes8[] calldata ethToTokenReserveIds,
        uint[] calldata ethToTokenSplits
    )
        external
        pure
        returns(bytes memory hint)
    {
        HintErrors verified = verifyData(ethToTokenType, ethToTokenReserveIds, ethToTokenSplits);

        if (verified == HintErrors.NoError) {
            hint = abi.encode(
                ethToTokenType,
                ethToTokenReserveIds,
                ethToTokenSplits
            );
        } else {
            throwHintError(verified);
        }
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
        bytes8[] calldata tokenToEthReserveIds,
        uint[] calldata tokenToEthSplits,
        TradeType ethToTokenType,
        bytes8[] calldata ethToTokenReserveIds,
        uint[] calldata ethToTokenSplits
    )
        external
        pure
        returns(bytes memory hint)
    {
        HintErrors verifiedT2E = verifyData(tokenToEthType, tokenToEthReserveIds, tokenToEthSplits);
        HintErrors verifiedE2T = verifyData(ethToTokenType, ethToTokenReserveIds, ethToTokenSplits);

        if (verifiedT2E != HintErrors.NoError) {
            throwHintError(verifiedT2E);
        } else if (verifiedE2T != HintErrors.NoError) {
            throwHintError(verifiedE2T);
        } else {
            hint = abi.encode(
                tokenToEthType,
                tokenToEthReserveIds,
                tokenToEthSplits,
                ethToTokenType,
                ethToTokenReserveIds,
                ethToTokenSplits
            );
        }
    }

    /// @notice Parses the hint for a Token to ETH trade
    /// @param hint The ABI encoded hint, built using the build*Hint functions
    /// @return returns the decoded Token to ETH trade hint type, reserve IDs, and splits
    function parseTokenToEthHint(bytes calldata hint)
        external
        view
        returns(
            TradeType tokenToEthType,
            bytes8[] memory tokenToEthReserveIds,
            IKyberReserve[] memory tokenToEthAddresses,
            uint[] memory tokenToEthSplits
        )
    {
        HintErrors error;

        (tokenToEthType, tokenToEthAddresses, tokenToEthSplits, error) = parseHint(hint);

        if (error != HintErrors.NoError) throwHintError(error);

        tokenToEthReserveIds = new bytes8[](tokenToEthAddresses.length);

        for (uint i = 0; i < tokenToEthAddresses.length; i++) {
            tokenToEthReserveIds[i] = convertAddressToReserveId(address(tokenToEthAddresses[i]));
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
            bytes8[] memory ethToTokenReserveIds,
            IKyberReserve[] memory ethToTokenAddresses,
            uint[] memory ethToTokenSplits
        )
    {
        HintErrors error;

        (ethToTokenType, ethToTokenAddresses, ethToTokenSplits, error) = parseHint(hint);

        if (error != HintErrors.NoError) throwHintError(error);

        ethToTokenReserveIds = new bytes8[](ethToTokenAddresses.length);

        for (uint i = 0; i < ethToTokenAddresses.length; i++) {
            ethToTokenReserveIds[i] = convertAddressToReserveId(address(ethToTokenAddresses[i]));
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
            bytes8[] memory tokenToEthReserveIds,
            IKyberReserve[] memory tokenToEthAddresses,
            uint[] memory tokenToEthSplits,
            TradeType ethToTokenType,
            bytes8[] memory ethToTokenReserveIds,
            IKyberReserve[] memory ethToTokenAddresses,
            uint[] memory ethToTokenSplits
        )
    {
        HintErrors error;

        (
            tokenToEthType,
            tokenToEthAddresses,
            tokenToEthSplits,
            ethToTokenType,
            ethToTokenAddresses,
            ethToTokenSplits,
            error
        ) = parseHintT2T(hint);

        if (error != HintErrors.NoError) throwHintError(error);

        tokenToEthReserveIds = new bytes8[](tokenToEthAddresses.length);
        ethToTokenReserveIds = new bytes8[](ethToTokenAddresses.length);

        for (uint i = 0; i < tokenToEthAddresses.length; i++) {
            tokenToEthReserveIds[i] = convertAddressToReserveId(address(tokenToEthAddresses[i]));
        }
        for (uint i = 0; i < ethToTokenAddresses.length; i++) {
            ethToTokenReserveIds[i] = convertAddressToReserveId(address(ethToTokenAddresses[i]));
        }
    }

    function parseHint(bytes memory hint)
        internal
        view
        returns(
            TradeType tradeType,
            IKyberReserve[] memory addresses,
            uint[] memory splits,
            HintErrors verified
        )
    {
        bytes8[] memory reserveIds;

        (tradeType, reserveIds, splits) = abi.decode(hint, (TradeType, bytes8[], uint[]));
        verified = verifyData(tradeType, reserveIds, splits);

        if (verified == HintErrors.NoError) {
            addresses = new IKyberReserve[](reserveIds.length);
            
            for (uint i = 0; i < reserveIds.length; i++) {
                addresses[i] = IKyberReserve(convertReserveIdToAddress(reserveIds[i]));
            }
        } else {
            splits = new uint[](0);
        }
    }

    function parseHintT2T(bytes memory hint)
        internal
        view
        returns(
            TradeType t2eType,
            IKyberReserve[] memory t2eAddresses,
            uint[] memory t2eSplits,
            TradeType e2tType,
            IKyberReserve[] memory e2tAddresses,
            uint[] memory e2tSplits,
            HintErrors verified
        )
    {
        bytes8[] memory t2eReserveIds;
        bytes8[] memory e2tReserveIds;

        (
            t2eType,
            t2eReserveIds,
            t2eSplits,
            e2tType,
            e2tReserveIds,
            e2tSplits
        ) = abi.decode(hint, (TradeType, bytes8[], uint[], TradeType, bytes8[], uint[]));
        HintErrors verifiedT2E = verifyData(t2eType, t2eReserveIds, t2eSplits);
        HintErrors verifiedE2T = verifyData(e2tType, e2tReserveIds, e2tSplits);

        if (verifiedT2E == HintErrors.NoError && verifiedE2T == HintErrors.NoError) {
            t2eAddresses = new IKyberReserve[](t2eReserveIds.length);
            e2tAddresses = new IKyberReserve[](e2tReserveIds.length);
            verified = HintErrors.NoError;
            
            for (uint i = 0; i < t2eReserveIds.length; i++) {
                t2eAddresses[i] = IKyberReserve(convertReserveIdToAddress(t2eReserveIds[i]));
            }
            for (uint i = 0; i < e2tReserveIds.length; i++) {
                e2tAddresses[i] = IKyberReserve(convertReserveIdToAddress(e2tReserveIds[i]));
            }
        } else {
            t2eSplits = new uint[](0);
            e2tSplits = new uint[](0);

            if (verifiedT2E != HintErrors.NoError) verified = verifiedT2E;
            if (verifiedE2T != HintErrors.NoError) verified = verifiedE2T;
        }
    }

    /// @notice Ensures that the data passed when building/parsing hints is valid
    /// @param tradeType Trade hint type
    /// @param reserveIds Reserve IDs
    /// @param splits Reserve splits
    /// @return returns a HintError enum to indicate valid or invalid hint data
    function verifyData(
        TradeType tradeType,
        bytes8[] memory reserveIds,
        uint[] memory splits
    )
        internal
        pure
        returns (HintErrors)
    {
        if (!(reserveIds.length > 0)) return HintErrors.ReserveIdZeroError;
        if (tradeType == TradeType.Split) {
            if (reserveIds.length != splits.length) return HintErrors.ReserveIdSplitsError;

            uint bpsSoFar;
            bytes8[] memory checkDuplicateIds = new bytes8[](reserveIds.length);
            for (uint i = 0; i < splits.length; i++) {
                bpsSoFar += splits[i];
                for (uint j = 0; j < checkDuplicateIds.length; j++) {
                    if (reserveIds[i] == checkDuplicateIds[j]) return false;
                }
                checkDuplicateIds[i] = reserveIds[i];
            }

            if (bpsSoFar != BPS) return HintErrors.TotalBPSError;
        } else {
            if (splits.length != 0) return HintErrors.SplitsZeroError;
        }

        return HintErrors.NoError;
    }

    /// @notice Throws error message to user to indicate error on hint
    /// @param error Error type from HintErrors enum
    function throwHintError(HintErrors error) internal pure {
        if (error == HintErrors.ReserveIdZeroError)
            revert("reserveIds cannot be empty");
        if (error == HintErrors.ReserveIdSplitsError)
            revert("reserveIds and splits length not equal");
        if (error == HintErrors.TotalBPSError)
            revert("splits total BPS does not amount to 10000BPS");
        if (error == HintErrors.SplitsZeroError)
            revert("splits cannot be empty");
    }

    function convertReserveIdToAddress(bytes8 reserveId) internal view returns (address);
    function convertAddressToReserveId(address reserveAddress) internal view returns (bytes8);
}
