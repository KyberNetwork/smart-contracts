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
        bool valid = verifyData(tokenToEthType, tokenToEthReserveIds, tokenToEthSplits);
        require(valid, "Invalid data for hint");

        hint = abi.encode(
            tokenToEthType,
            tokenToEthReserveIds,
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
        bytes8[] calldata ethToTokenReserveIds,
        uint[] calldata ethToTokenSplits
    )
        external
        pure
        returns(bytes memory hint)
    {
        bool valid = verifyData(ethToTokenType, ethToTokenReserveIds, ethToTokenSplits);
        require(valid, "Invalid data for hint");

        hint = abi.encode(
            ethToTokenType,
            ethToTokenReserveIds,
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
        bool validT2E = verifyData(tokenToEthType, tokenToEthReserveIds, tokenToEthSplits);
        bool validE2T = verifyData(ethToTokenType, ethToTokenReserveIds, ethToTokenSplits);
        require(validT2E, "Invalid T2E data for hint");
        require(validE2T, "Invalid E2T data for hint");

        hint = abi.encode(
            tokenToEthType,
            tokenToEthReserveIds,
            tokenToEthSplits,
            ethToTokenType,
            ethToTokenReserveIds,
            ethToTokenSplits
        );
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
        (tokenToEthType, tokenToEthAddresses, tokenToEthSplits) = parseHint(hint);

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
        (ethToTokenType, ethToTokenAddresses, ethToTokenSplits) = parseHint(hint);

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
        (
            tokenToEthType,
            tokenToEthAddresses,
            tokenToEthSplits,
            ethToTokenType,
            ethToTokenAddresses,
            ethToTokenSplits
        ) = parseHintT2T(hint);

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
            uint[] memory splits
        )
    {
        bytes8[] memory reserveIds;

        (tradeType, reserveIds, splits) = abi.decode(hint, (TradeType, bytes8[], uint[]));
        bool valid = verifyData(tradeType, reserveIds, splits);

        if (valid) {
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
            uint[] memory e2tSplits
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
        bool validT2E = verifyData(t2eType, t2eReserveIds, t2eSplits);
        bool validE2T = verifyData(e2tType, e2tReserveIds, e2tSplits);

        if (validT2E && validE2T) {
            t2eAddresses = new IKyberReserve[](t2eReserveIds.length);
            e2tAddresses = new IKyberReserve[](e2tReserveIds.length);
            
            for (uint i = 0; i < t2eReserveIds.length; i++) {
                t2eAddresses[i] = IKyberReserve(convertReserveIdToAddress(t2eReserveIds[i]));
            }
            for (uint i = 0; i < e2tReserveIds.length; i++) {
                e2tAddresses[i] = IKyberReserve(convertReserveIdToAddress(e2tReserveIds[i]));
            }
        } else {
            t2eSplits = new uint[](0);
            e2tSplits = new uint[](0);
        }
    }

    /// @notice Ensures that the data passed when building/parsing hints is valid
    /// @param tradeType Trade hint type
    /// @param reserveIds Reserve IDs
    /// @param splits Reserve splits
    /// @return returns a boolean if the data passed is valid
    function verifyData(
        TradeType tradeType,
        bytes8[] memory reserveIds,
        uint[] memory splits
    )
        internal
        pure
        returns (bool)
    {
        if (!(reserveIds.length > 0)) return false;
        if (tradeType == TradeType.Split) {
            if (reserveIds.length != splits.length) return false;

            uint bpsSoFar;
            for (uint i = 0; i < splits.length; i++) {
                bpsSoFar += splits[i];
            }

            if (bpsSoFar != BPS) return false;
        } else {
            if (splits.length != 0) return false;
        }

        return true;
    }

    function convertReserveIdToAddress(bytes8 reserveId) internal view returns (address);
    function convertAddressToReserveId(address reserveAddress) internal view returns (bytes8);
}
