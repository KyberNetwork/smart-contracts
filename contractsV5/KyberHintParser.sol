pragma solidity 0.5.11;

import "./IERC20.sol";
import "./BytesLib.sol";
import "./IKyberHint.sol";
import "./UtilsV5.sol";

contract KyberHintParser is IKyberHint, Utils {
    bytes public constant SEPARATOR = "\x00";
    bytes public constant MASK_IN_OPCODE = "\x01";
    bytes public constant MASK_OUT_OPCODE = "\x02";
    bytes public constant SPLIT_TRADE_OPCODE = "\x03";
    bytes public constant END_OPCODE = "\xee";
    uint8 public constant RESERVE_ID_LENGTH = 3;

    using BytesLib for bytes;

    struct ReservesHint {
        HintType hintType;
        bytes3[] reserveIds;
        uint[] splitValuesBps;
    }

    struct TradeHint {
        ReservesHint ethToTokenReserves;
        ReservesHint tokenToEthReserves;
    }

    function parseEthToTokenHint(bytes memory hint)
        public
        view
        returns(
            HintType ethToTokenType,
            bytes3[] memory ethToTokenReserveIds,
            uint[] memory ethToTokenSplits,
            uint failingIndex
        )
    {
        TradeHint memory tradeHint;
        uint indexToContinueFrom;

        decodeOperation(hint, tradeHint, indexToContinueFrom, false);

        ethToTokenType = tradeHint.ethToTokenReserves.hintType;
        ethToTokenReserveIds = tradeHint.ethToTokenReserves.reserveIds;
        ethToTokenSplits = tradeHint.ethToTokenReserves.splitValuesBps;

        failingIndex = indexToContinueFrom;
    }

    function parseTokenToEthHint(bytes memory hint)
        public
        view
        returns(
            HintType tokenToEthType,
            bytes3[] memory tokenToEthReserveIds,
            uint[] memory tokenToEthSplits,
            uint failingIndex
        )
    {
        TradeHint memory tradeHint;
        uint indexToContinueFrom;

        decodeOperation(hint, tradeHint, indexToContinueFrom, true);

        tokenToEthType = tradeHint.tokenToEthReserves.hintType;
        tokenToEthReserveIds = tradeHint.tokenToEthReserves.reserveIds;
        tokenToEthSplits = tradeHint.tokenToEthReserves.splitValuesBps;

        failingIndex = indexToContinueFrom;
    }

    function parseTokenToTokenHint(bytes memory hint)
        public
        view
        returns(
            HintType tokenToEthType,
            bytes3[] memory tokenToEthReserveIds,
            uint[] memory tokenToEthSplits,
            HintType ethToTokenType,
            bytes3[] memory ethToTokenReserveIds,
            uint[] memory ethToTokenSplits, 
            uint failingIndex
        )
    {
        TradeHint memory tradeHint;
        uint indexToContinueFrom;

        decodeOperation(hint, tradeHint, indexToContinueFrom, true);

        ethToTokenType = tradeHint.ethToTokenReserves.hintType;
        ethToTokenReserveIds = tradeHint.ethToTokenReserves.reserveIds;
        ethToTokenSplits = tradeHint.ethToTokenReserves.splitValuesBps;

        tokenToEthType = tradeHint.tokenToEthReserves.hintType;
        tokenToEthReserveIds = tradeHint.tokenToEthReserves.reserveIds;
        tokenToEthSplits = tradeHint.tokenToEthReserves.splitValuesBps;

        failingIndex = indexToContinueFrom;
    }

    function buildEthToTokenHint(
        HintType ethToTokenType,
        bytes3[] memory ethToTokenReserveIds,
        uint[] memory ethToTokenSplits
    )
        public
        view
        returns(bytes memory hint)
    {
        hint = hint.concat(SEPARATOR);
        hint = hint.concat(encodeReserveInfo(ethToTokenType, ethToTokenReserveIds, ethToTokenSplits));
        hint = hint.concat(END_OPCODE);
    }

    function buildTokenToEthHint(
        HintType tokenToEthType,
        bytes3[] memory tokenToEthReserveIds,
        uint[] memory tokenToEthSplits
    )
        public
        view
        returns(bytes memory hint)
    {
        hint = hint.concat(encodeReserveInfo(tokenToEthType, tokenToEthReserveIds, tokenToEthSplits));
        hint = hint.concat(SEPARATOR);
        hint = hint.concat(END_OPCODE);
    }

    function buildTokenToTokenHint(
        HintType tokenToEthType,
        bytes3[] memory tokenToEthReserveIds,
        uint[] memory tokenToEthSplits,
        HintType ethToTokenType,
        bytes3[] memory ethToTokenReserveIds,
        uint[] memory ethToTokenSplits
    )
        public
        pure
        returns(bytes memory hint)
    {
        hint = hint.concat(encodeReserveInfo(tokenToEthType, tokenToEthReserveIds, tokenToEthSplits));
        hint = hint.concat(SEPARATOR);
        hint = hint.concat(encodeReserveInfo(ethToTokenType, ethToTokenReserveIds, ethToTokenSplits));
        hint = hint.concat(END_OPCODE);
    }

    function getBytes(bytes memory _hint, uint _start, uint _length) public pure returns (bytes memory) {
        return _hint.slice(_start,_length);
    }

    function getSingleByte(bytes memory _hint, uint _index) public pure returns (bytes memory) {
        return abi.encodePacked(_hint[_index]);
    }

    function encodeUint(uint num) public pure returns (bytes memory hint) {
        return hint.concat(abi.encodePacked(uint16(num)));
    }

    function encodeReserveInfo(
        HintType opcode,
        bytes3[] memory reserveIds,
        uint[] memory bps
    )
        internal
        pure
        returns (bytes memory hint)
    {
        uint bpsSoFar;
        if (reserveIds.length > 0) {
            hint = hint.concat(parseOpcode(opcode));
            hint = hint.concat(abi.encodePacked(uint8(reserveIds.length)));
            for (uint i = 0; i < reserveIds.length; i++) {
                hint = hint.concat(abi.encodePacked(reserveIds[i]));
                if (keccak256(parseOpcode(opcode)) == keccak256(parseOpcode(HintType.Split))) {
                    hint = hint.concat(abi.encodePacked(uint16(bps[i])));
                    bpsSoFar += bps[i];
                }
            }
            require((bpsSoFar == BPS) || (bpsSoFar == 0), "bps do not sum to 10000");
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
        bytes32 opcodeHash = keccak256(opcode);
        ReservesHint memory reserves;

        if (isTokenToEth) {
            reserves = tradeHint.tokenToEthReserves;
        } else {
            reserves = tradeHint.ethToTokenReserves;
        }

        indexToContinueFrom += 1;
        if (opcodeHash == keccak256(END_OPCODE)) {
            return;
        } else if (opcodeHash == keccak256(SEPARATOR)) {
            decodeOperation(hint, tradeHint, indexToContinueFrom, false);
        } else if (opcodeHash == keccak256(parseOpcode(HintType.MaskIn))) {
            reserves.hintType = HintType.MaskIn;
            (reserves.reserveIds, reserves.splitValuesBps, indexToContinueFrom) = decodeReservesFromHint(false, hint, indexToContinueFrom);
            decodeOperation(hint, tradeHint, indexToContinueFrom, isTokenToEth);
        } else if (opcodeHash == keccak256(parseOpcode(HintType.MaskOut))) {
            reserves.hintType = HintType.MaskOut;
            (reserves.reserveIds, reserves.splitValuesBps, indexToContinueFrom) = decodeReservesFromHint(false, hint, indexToContinueFrom);
            decodeOperation(hint, tradeHint, indexToContinueFrom, isTokenToEth);
        } else if (opcodeHash == keccak256(parseOpcode(HintType.Split))) {
            reserves.hintType = HintType.Split;
            (reserves.reserveIds, reserves.splitValuesBps, indexToContinueFrom) = decodeReservesFromHint(true, hint, indexToContinueFrom);
            decodeOperation(hint, tradeHint, indexToContinueFrom, isTokenToEth);
        } else {
            revert("Invalid hint opcode");
        }
    }

    function decodeReservesFromHint(
        bool isTokenSplit,
        bytes memory hint,
        uint indexToContinueFrom
    )
        internal
        pure
        returns (
            bytes3[] memory,
            uint[] memory,
            uint
        )
    {
       uint reservesLength = hint.toUint8(indexToContinueFrom);
       uint bpsSoFar;
       uint[] memory splitValuesBps;

       bytes3[] memory reserveIds = new bytes3[](reservesLength);
       if (isTokenSplit) {
           splitValuesBps = new uint[](reservesLength);
       } else {
           splitValuesBps = new uint[](1);
           splitValuesBps[0] = BPS;
       }
       indexToContinueFrom++;

       for (uint i = 0; i < reservesLength; i++) {
           reserveIds[i] = hint.slice(indexToContinueFrom, RESERVE_ID_LENGTH).toBytes3(0);
           indexToContinueFrom += RESERVE_ID_LENGTH;
           if (isTokenSplit) {
               splitValuesBps[i] = uint(hint.toUint16(indexToContinueFrom));
               bpsSoFar += splitValuesBps[i];
               indexToContinueFrom += 2;
           }
       }
       require((bpsSoFar == BPS) || (bpsSoFar == 0), "bps do not sum to 10000");
       return (reserveIds, splitValuesBps, indexToContinueFrom);
    }

    function parseOpcode(HintType h) internal pure returns (bytes memory) {
        if (h == HintType.MaskIn) {
            return MASK_IN_OPCODE;
        } else if (h == HintType.MaskOut) {
            return MASK_OUT_OPCODE;
        } else if (h == HintType.Split) {
            return SPLIT_TRADE_OPCODE;
        }
    }
}
