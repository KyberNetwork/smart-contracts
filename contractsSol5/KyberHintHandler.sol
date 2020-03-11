pragma solidity 0.5.11;

import "./utils/BytesLib.sol";
import "./utils/Utils4.sol";
import "./IKyberHint.sol";
import "./IKyberReserve.sol";


contract KyberHintHandler is IKyberHint, Utils4 {
    uint8 internal constant RESERVE_ID_LENGTH = 8;
    bytes internal constant SEPARATOR_OPCODE = "\x77";
    bytes internal constant MASK_IN_OPCODE = "\x01";
    bytes internal constant MASK_OUT_OPCODE = "\x02";
    bytes internal constant SPLIT_TRADE_OPCODE = "\x03";
    bytes internal constant END_OPCODE = "\xee";
    bytes32 internal constant SEPARATOR_KECCAK = keccak256(SEPARATOR_OPCODE);
    bytes32 internal constant MASK_IN_KECCAK = keccak256(MASK_IN_OPCODE);
    bytes32 internal constant MASK_OUT_KECCAK = keccak256(MASK_OUT_OPCODE);
    bytes32 internal constant SPLIT_TRADE_KECCAK = keccak256(SPLIT_TRADE_OPCODE);
    bytes32 internal constant END_KECCAK = keccak256(END_OPCODE);

    using BytesLib for bytes;

    struct ReservesHint {
        TradeType tradeType;
        IKyberReserve[] addresses;
        uint[] splitValuesBps;
    }

    struct TradeHint {
        ReservesHint ethToTokenReserves;
        ReservesHint tokenToEthReserves;
        bool hintError;
        uint hintIndex;
    }

    function parseHintE2T(bytes memory hint)
        internal
        view
        returns(
            TradeType tradeType,
            IKyberReserve[] memory addresses,
            uint[] memory splits,
            uint failedIndex
        )
    {
        TradeHint memory tradeHint;

        decodeOperation(hint, tradeHint, false);

        if (!tradeHint.hintError) {
            tradeType = tradeHint.ethToTokenReserves.tradeType;
            addresses = tradeHint.ethToTokenReserves.addresses;
            splits = tradeHint.ethToTokenReserves.splitValuesBps;
        } else {
            failedIndex = tradeHint.hintIndex;
        }
    }

    function parseHintT2E(bytes memory hint)
        internal
        view
        returns(
            TradeType tradeType,
            IKyberReserve[] memory addresses,
            uint[] memory splits,
            uint failedIndex
        )
    {
        TradeHint memory tradeHint;

        decodeOperation(hint, tradeHint, true);

        if (!tradeHint.hintError) {
            tradeType = tradeHint.tokenToEthReserves.tradeType;
            addresses = tradeHint.tokenToEthReserves.addresses;
            splits = tradeHint.tokenToEthReserves.splitValuesBps;
        } else {
            failedIndex = tradeHint.hintIndex;
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
            uint failedIndex
        )
    {
        TradeHint memory tradeHint;

        decodeOperation(hint, tradeHint, true);

        if (!tradeHint.hintError) {
            t2eType = tradeHint.tokenToEthReserves.tradeType;
            t2eAddresses = tradeHint.tokenToEthReserves.addresses;
            t2eSplits = tradeHint.tokenToEthReserves.splitValuesBps;

            e2tType = tradeHint.ethToTokenReserves.tradeType;
            e2tAddresses = tradeHint.ethToTokenReserves.addresses;
            e2tSplits = tradeHint.ethToTokenReserves.splitValuesBps;
        } else {
            failedIndex = tradeHint.hintIndex;
        }
    }

    function buildEthToTokenHint(
        TradeType ethToTokenType,
        bytes8[] memory ethToTokenReserveIds,
        uint[] memory ethToTokenSplits
    )
        public
        pure
        returns(bytes memory hint)
    {
        hint = hint.concat(SEPARATOR_OPCODE);
        hint = hint.concat(encodeReserveInfo(ethToTokenType, ethToTokenReserveIds, ethToTokenSplits));
        hint = hint.concat(END_OPCODE);
    }

    function buildTokenToEthHint(
        TradeType tokenToEthType,
        bytes8[] memory tokenToEthReserveIds,
        uint[] memory tokenToEthSplits
    )
        public
        pure
        returns(bytes memory hint)
    {
        hint = hint.concat(encodeReserveInfo(tokenToEthType, tokenToEthReserveIds, tokenToEthSplits));
        hint = hint.concat(SEPARATOR_OPCODE);
        hint = hint.concat(END_OPCODE);
    }

    function buildTokenToTokenHint(
        TradeType tokenToEthType,
        bytes8[] memory tokenToEthReserveIds,
        uint[] memory tokenToEthSplits,
        TradeType ethToTokenType,
        bytes8[] memory ethToTokenReserveIds,
        uint[] memory ethToTokenSplits
    )
        public
        pure
        returns(bytes memory hint)
    {
        hint = hint.concat(encodeReserveInfo(tokenToEthType, tokenToEthReserveIds, tokenToEthSplits));
        hint = hint.concat(SEPARATOR_OPCODE);
        hint = hint.concat(encodeReserveInfo(ethToTokenType, ethToTokenReserveIds, ethToTokenSplits));
        hint = hint.concat(END_OPCODE);
    }

    function encodeReserveInfo(
        TradeType opcode,
        bytes8[] memory reserveIds,
        uint[] memory bps
    )
        internal
        pure
        returns (bytes memory hint)
    {
        uint bpsSoFar;
        if (reserveIds.length > 0) {
            hint = hint.concat(encodeOpcode(opcode));
            hint = hint.concat(abi.encodePacked(uint8(reserveIds.length)));
            for (uint i = 0; i < reserveIds.length; i++) {
                hint = hint.concat(abi.encodePacked(reserveIds[i]));
                if (keccak256(encodeOpcode(opcode)) == keccak256(encodeOpcode(TradeType.Split))) {
                    hint = hint.concat(abi.encodePacked(uint16(bps[i])));
                    bpsSoFar += bps[i];
                }
            }
            require((bpsSoFar == BPS) || (bpsSoFar == 0), "BPS <> 10000");
        }
    }

    function decodeOperation(
        bytes memory hint,
        TradeHint memory tradeHint,
        bool isTokenToEth
    )
        internal
        view
    {
        if (tradeHint.hintError) return;

        bytes memory opcode = hint.slice(tradeHint.hintIndex, 1);
        bytes32 opcodeKeccak = keccak256(opcode);

        tradeHint.hintIndex += 1;

        if (opcodeKeccak == END_KECCAK) {
            return;
        } else if (opcodeKeccak == SEPARATOR_KECCAK) {
            decodeOperation(hint, tradeHint, false);
        } else if (opcodeKeccak == MASK_IN_KECCAK) {
            decodeReservesFromHint(false, hint, TradeType.MaskIn, tradeHint, isTokenToEth);
            decodeOperation(hint, tradeHint, isTokenToEth);
        } else if (opcodeKeccak == MASK_OUT_KECCAK) {
            decodeReservesFromHint(false, hint, TradeType.MaskOut, tradeHint, isTokenToEth);
            decodeOperation(hint, tradeHint, isTokenToEth);
        } else if (opcodeKeccak == SPLIT_TRADE_KECCAK) {
            decodeReservesFromHint(true, hint, TradeType.Split, tradeHint, isTokenToEth);
            decodeOperation(hint, tradeHint, isTokenToEth);
        } else {
            tradeHint.hintError = true;
        }
    }

    function decodeReservesFromHint(
        bool isTokenSplit,
        bytes memory hint,
        TradeType tradeType,
        TradeHint memory tradeHint,
        bool isTokenToEth
    )
        internal
        view
    {
        uint bpsSoFar;
        uint[] memory splitValuesBps;
        ReservesHint memory reservesHint;
        uint reservesLength = hint.toUint8(tradeHint.hintIndex);
        IKyberReserve[] memory addresses = new IKyberReserve[](reservesLength);

        if (isTokenSplit) {
            splitValuesBps = new uint[](reservesLength);
        } else {
            splitValuesBps = new uint[](1);
            splitValuesBps[0] = BPS;
        }

        tradeHint.hintIndex++;

        for (uint i = 0; i < reservesLength; i++) {
            addresses[i] = IKyberReserve(convertReserveIdToAddress(hint.slice(tradeHint.hintIndex, RESERVE_ID_LENGTH).toBytes8(0)));

            tradeHint.hintIndex += RESERVE_ID_LENGTH;

            if (isTokenSplit) {
                splitValuesBps[i] = uint(hint.toUint16(tradeHint.hintIndex));
                bpsSoFar += splitValuesBps[i];
                tradeHint.hintIndex += 2;
            }
        }

        if (isTokenToEth) {
            reservesHint = tradeHint.tokenToEthReserves;
        } else {
            reservesHint = tradeHint.ethToTokenReserves;
        }

        if (bpsSoFar == BPS || bpsSoFar == 0) {
            reservesHint.tradeType = tradeType;
            reservesHint.addresses = addresses;
            reservesHint.splitValuesBps = splitValuesBps;
        } else {
            tradeHint.hintError = true;
        }
    }

    function encodeOpcode(TradeType tradeType) internal pure returns (bytes memory) {
        if (tradeType == TradeType.MaskIn) {
            return MASK_IN_OPCODE;
        } else if (tradeType == TradeType.MaskOut) {
            return MASK_OUT_OPCODE;
        } else if (tradeType == TradeType.Split) {
            return SPLIT_TRADE_OPCODE;
        } else {
            revert("Invalid trade type");
        }
    }

    function parseEthToTokenHint(bytes calldata hint)
        external
        view
        returns(
            TradeType ethToTokenType,
            bytes8[] memory ethToTokenReserveIds,
            uint[] memory ethToTokenSplits,
            uint failedIndex
        )
    {
        IKyberReserve[] memory ethToTokenAddresses;

        (ethToTokenType, ethToTokenAddresses, ethToTokenSplits, failedIndex) = parseHintE2T(hint);

        if (failedIndex == 0) {
            ethToTokenReserveIds = new bytes8[](ethToTokenAddresses.length);

            for (uint i = 0; i < ethToTokenAddresses.length; i++) {
                ethToTokenReserveIds[i] = convertAddressToReserveId(address(ethToTokenAddresses[i]));
            }
        }
    }

    function parseTokenToEthHint(bytes calldata hint)
        external
        view
        returns(
            TradeType tokenToEthType,
            bytes8[] memory tokenToEthReserveIds,
            uint[] memory tokenToEthSplits,
            uint failedIndex
        )
    {
        IKyberReserve[] memory tokenToEthAddresses;

        (tokenToEthType, tokenToEthAddresses, tokenToEthSplits, failedIndex) = parseHintT2E(hint);

        if (failedIndex == 0) {
            tokenToEthReserveIds = new bytes8[](tokenToEthAddresses.length);

            for (uint i = 0; i < tokenToEthAddresses.length; i++) {
                tokenToEthReserveIds[i] = convertAddressToReserveId(address(tokenToEthAddresses[i]));
            }
        }
    }

    function parseTokenToTokenHint(bytes calldata hint)
        external
        view
        returns(
            TradeType tokenToEthType,
            bytes8[] memory tokenToEthReserveIds,
            uint[] memory tokenToEthSplits,
            TradeType ethToTokenType,
            bytes8[] memory ethToTokenReserveIds,
            uint[] memory ethToTokenSplits,
            uint failedIndex
        )
    {
        IKyberReserve[] memory tokenToEthAddresses;
        IKyberReserve[] memory ethToTokenAddresses;

        (
            tokenToEthType,
            tokenToEthAddresses,
            tokenToEthSplits,
            ethToTokenType,
            ethToTokenAddresses,
            ethToTokenSplits,
            failedIndex
        ) = parseHintT2T(hint);

        if (failedIndex == 0) {
            tokenToEthReserveIds = new bytes8[](tokenToEthAddresses.length);
            ethToTokenReserveIds = new bytes8[](ethToTokenAddresses.length);

            for (uint i = 0; i < tokenToEthAddresses.length; i++) {
                tokenToEthReserveIds[i] = convertAddressToReserveId(address(tokenToEthAddresses[i]));
            }
            for (uint i = 0; i < ethToTokenAddresses.length; i++) {
                ethToTokenReserveIds[i] = convertAddressToReserveId(address(ethToTokenAddresses[i]));
            }
        }
    }

    function convertReserveIdToAddress(bytes8 reserveId) internal view returns (address);
    function convertAddressToReserveId(address reserveAddress) internal view returns (bytes8);
}
