pragma solidity 0.5.11;

import "./BytesLib.sol";
import "./UtilsV5.sol";
import "./IKyberHint.sol";
import "./IKyberReserve.sol";


contract KyberHintHandler is IKyberHint, Utils {
    bytes public constant SEPARATOR_OPCODE = "\x00";
    bytes public constant MASK_IN_OPCODE = "\x01";
    bytes public constant MASK_OUT_OPCODE = "\x02";
    bytes public constant SPLIT_TRADE_OPCODE = "\x03";
    bytes public constant END_OPCODE = "\xee";
    bytes32 public constant SEPARATOR_KECCAK = keccak256(SEPARATOR_OPCODE);
    bytes32 public constant MASK_IN_KECCAK = keccak256(MASK_IN_OPCODE);
    bytes32 public constant MASK_OUT_KECCAK = keccak256(MASK_OUT_OPCODE);
    bytes32 public constant SPLIT_TRADE_KECCAK = keccak256(SPLIT_TRADE_OPCODE);
    bytes32 public constant END_KECCAK = keccak256(END_OPCODE);
    uint8 public constant RESERVE_ID_LENGTH = 8;

    using BytesLib for bytes;

    struct ReservesHint {
        TradeType tradeType;
        IKyberReserve[] addresses;
        uint[] splitValuesBps;
    }

    struct TradeHint {
        ReservesHint ethToTokenReserves;
        ReservesHint tokenToEthReserves;
    }

    function parseHintE2T(bytes memory hint)
        internal
        view
        returns(
            TradeType tradeType,
            IKyberReserve[] memory addresses,
            uint[] memory splits
        )
    {
        TradeHint memory tradeHint;
        uint indexToContinueFrom;

        decodeOperation(hint, tradeHint, indexToContinueFrom, false);

        tradeType = tradeHint.ethToTokenReserves.tradeType;
        addresses = tradeHint.ethToTokenReserves.addresses;
        splits = tradeHint.ethToTokenReserves.splitValuesBps;
    }

    function parseHintT2E(bytes memory hint)
        internal
        view
        returns(
            TradeType tradeType,
            IKyberReserve[] memory addresses,
            uint[] memory splits
        )
    {
        TradeHint memory tradeHint;
        uint indexToContinueFrom;

        decodeOperation(hint, tradeHint, indexToContinueFrom, true);

        tradeType = tradeHint.tokenToEthReserves.tradeType;
        addresses = tradeHint.tokenToEthReserves.addresses;
        splits = tradeHint.tokenToEthReserves.splitValuesBps;
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
        TradeHint memory tradeHint;
        uint indexToContinueFrom;

        decodeOperation(hint, tradeHint, indexToContinueFrom, true);

        t2eType = tradeHint.tokenToEthReserves.tradeType;
        t2eAddresses = tradeHint.tokenToEthReserves.addresses;
        t2eSplits = tradeHint.tokenToEthReserves.splitValuesBps;

        e2tType = tradeHint.ethToTokenReserves.tradeType;
        e2tAddresses = tradeHint.ethToTokenReserves.addresses;
        e2tSplits = tradeHint.ethToTokenReserves.splitValuesBps;
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
            require((bpsSoFar == BPS) || (bpsSoFar == 0), "BPS > 10000");
        }
    }

    function decodeOperation(
        bytes memory hint,
        TradeHint memory tradeHint,
        uint indexToContinueFrom,
        bool isTokenToEth
    )
        internal
        view
    {
        bytes memory opcode = hint.slice(indexToContinueFrom, 1);
        bytes32 opcodeKeccak = keccak256(opcode);
        ReservesHint memory reservesHint;

        if (isTokenToEth) {
            reservesHint = tradeHint.tokenToEthReserves;
        } else {
            reservesHint = tradeHint.ethToTokenReserves;
        }

        indexToContinueFrom += 1;

        if (opcodeKeccak == END_KECCAK) {
            return;
        } else if (opcodeKeccak == SEPARATOR_KECCAK) {
            decodeOperation(hint, tradeHint, indexToContinueFrom, false);
        } else if (opcodeKeccak == MASK_IN_KECCAK) {
            reservesHint.tradeType = TradeType.MaskIn;
            (indexToContinueFrom) = decodeReservesFromHint(false, hint, reservesHint, indexToContinueFrom);
            decodeOperation(hint, tradeHint, indexToContinueFrom, isTokenToEth);
        } else if (opcodeKeccak == MASK_OUT_KECCAK) {
            reservesHint.tradeType = TradeType.MaskOut;
            (indexToContinueFrom) = decodeReservesFromHint(false, hint, reservesHint, indexToContinueFrom);
            decodeOperation(hint, tradeHint, indexToContinueFrom, isTokenToEth);
        } else if (opcodeKeccak == SPLIT_TRADE_KECCAK) {
            reservesHint.tradeType = TradeType.Split;
            (indexToContinueFrom) = decodeReservesFromHint(true, hint, reservesHint, indexToContinueFrom);
            decodeOperation(hint, tradeHint, indexToContinueFrom, isTokenToEth);
        } else {
            revert("Invalid hint opcode");
        }
    }

    function decodeReservesFromHint(
        bool isTokenSplit,
        bytes memory hint,
        ReservesHint memory reservesHint,
        uint indexToContinueFrom
    )
        internal
        view
        returns (
            uint
        )
    {
       uint reservesLength = hint.toUint8(indexToContinueFrom);
       uint bpsSoFar;
       uint[] memory splitValuesBps;
       IKyberReserve[] memory addresses = new IKyberReserve[](reservesLength);

       if (isTokenSplit) {
           splitValuesBps = new uint[](reservesLength);
       } else {
           splitValuesBps = new uint[](1);
           splitValuesBps[0] = BPS;
       }

       indexToContinueFrom++;      

       for (uint i = 0; i < reservesLength; i++) {
           addresses[i] = IKyberReserve(convertReserveIdToAddress(hint.slice(indexToContinueFrom, RESERVE_ID_LENGTH).toBytes8(0)));

           indexToContinueFrom += RESERVE_ID_LENGTH;

           if (isTokenSplit) {
               splitValuesBps[i] = uint(hint.toUint16(indexToContinueFrom));
               bpsSoFar += splitValuesBps[i];
               indexToContinueFrom += 2;
           }
       }

       require((bpsSoFar == BPS) || (bpsSoFar == 0), "BPS > 10000");

       reservesHint.addresses = addresses;
       reservesHint.splitValuesBps = splitValuesBps;

       return indexToContinueFrom;
    }

    function encodeOpcode(TradeType tradeType) internal pure returns (bytes memory) {
        if (tradeType == TradeType.MaskIn) {
            return MASK_IN_OPCODE;
        } else if (tradeType == TradeType.MaskOut) {
            return MASK_OUT_OPCODE;
        } else if (tradeType == TradeType.Split) {
            return SPLIT_TRADE_OPCODE;
        }
    }

    function parseEthToTokenHint(bytes calldata hint)
        external
        view
        returns(
            TradeType ethToTokenType,
            bytes8[] memory ethToTokenReserveIds,
            uint[] memory ethToTokenSplits
        )
    {
        IKyberReserve[] memory ethToTokenAddresses;

        (ethToTokenType, ethToTokenAddresses, ethToTokenSplits) = parseHintE2T(hint);

        ethToTokenReserveIds = new bytes8[](ethToTokenAddresses.length);

        for (uint i = 0; i < ethToTokenAddresses.length; i++) {
            ethToTokenReserveIds[i] = convertAddressToReserveId(address(ethToTokenAddresses[i]));
        }
    }
        
    function parseTokenToEthHint(bytes calldata hint)
        external
        view
        returns(
            TradeType tokenToEthType,
            bytes8[] memory tokenToEthReserveIds,
            uint[] memory tokenToEthSplits
        )
    {
        IKyberReserve[] memory tokenToEthAddresses;

        (tokenToEthType, tokenToEthAddresses, tokenToEthSplits) = parseHintT2E(hint);

        tokenToEthReserveIds = new bytes8[](tokenToEthAddresses.length);

        for (uint i = 0; i < tokenToEthAddresses.length; i++) {
            tokenToEthReserveIds[i] = convertAddressToReserveId(address(tokenToEthAddresses[i]));
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
            uint[] memory ethToTokenSplits
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

    function convertReserveIdToAddress(bytes8 reserveId) internal view returns (address);
    function convertAddressToReserveId(address reserveAddress) internal view returns (bytes8);
}
