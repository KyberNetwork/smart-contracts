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
    bytes public constant RESERVE_ID_FPR = "\xff";
    bytes public constant RESERVE_ID_APR = "\xaa";
    bytes public constant RESERVE_ID_OR = "\xcc";
    bytes public constant RESERVE_ID_BR = "\xbb";
    uint8 public constant RESERVE_ID_LENGTH = 3;

    using BytesLib for bytes;

    struct ReservesHint {
        bytes hintType;
        bytes3[] reserveIds;
        uint[] splitValuesBps;
    }

    struct TradeHint {
        ReservesHint ethToTokenReserves;
        ReservesHint tokenToEthReserves;
    }

    function parseHint(bytes memory hint)
        public
        view
        returns(
            bytes memory e2tHintType,
            bytes3[] memory e2tReserves,
            uint[] memory e2tSplits,
            bytes memory t2eHintType,
            bytes3[] memory t2eReserves,
            uint[] memory t2eSplits,
            uint failingIndex
        )
    {
        TradeHint memory tradeHint;
        uint indexToContinueFrom;

        decodeOperation(hint, tradeHint, indexToContinueFrom, true);

        e2tHintType = tradeHint.ethToTokenReserves.hintType;
        e2tReserves = tradeHint.ethToTokenReserves.reserveIds;
        e2tSplits = tradeHint.ethToTokenReserves.splitValuesBps;

        t2eHintType = tradeHint.tokenToEthReserves.hintType;
        t2eReserves = tradeHint.tokenToEthReserves.reserveIds;
        t2eSplits = tradeHint.tokenToEthReserves.splitValuesBps;
        failingIndex = indexToContinueFrom;
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
        } else if (opcodeHash == keccak256(MASK_IN_OPCODE)) {
            reserves.hintType = MASK_IN_OPCODE;
            (reserves.reserveIds, reserves.splitValuesBps, indexToContinueFrom) = decodeReservesFromHint(false, hint, indexToContinueFrom);
            decodeOperation(hint, tradeHint, indexToContinueFrom, isTokenToEth);
        } else if (opcodeHash == keccak256(MASK_OUT_OPCODE)) {
            reserves.hintType = MASK_OUT_OPCODE;
            (reserves.reserveIds, reserves.splitValuesBps, indexToContinueFrom) = decodeReservesFromHint(false, hint, indexToContinueFrom);
            decodeOperation(hint, tradeHint, indexToContinueFrom, isTokenToEth);
        } else if (opcodeHash == keccak256(SPLIT_TRADE_OPCODE)) {
            reserves.hintType = SPLIT_TRADE_OPCODE;
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
        public
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

    function getBytes(bytes memory _hint, uint _start, uint _length) public pure returns (bytes memory) {
        return _hint.slice(_start,_length);
    }

    function getSingleByte(bytes memory _hint, uint _index) public pure returns (bytes memory) {
        return abi.encodePacked(_hint[_index]);
    }

    function buildHint(
        bytes memory e2tOpcode,
        bytes3[] memory e2tReserves,
        uint[] memory e2tSplits,
        bytes memory t2eOpcode,
        bytes3[] memory t2eReserves,
        uint[] memory t2eSplits
    )
        public
        pure
        returns (bytes memory hint)
    {
        hint = hint.concat(encodeReserveInfo(t2eOpcode, t2eReserves, t2eSplits));
        hint = hint.concat(SEPARATOR);
        hint = hint.concat(encodeReserveInfo(e2tOpcode, e2tReserves, e2tSplits));
        hint = hint.concat(END_OPCODE);
    }

    function encodeReserveInfo(bytes memory opcode, bytes3[] memory reserveIds, uint[] memory bps) public pure returns (bytes memory hint) {
        uint bpsSoFar;
        if (reserveIds.length > 0) {
            hint = hint.concat(opcode);
            hint = hint.concat(abi.encodePacked(uint8(reserveIds.length)));
            for (uint i = 0; i < reserveIds.length; i++) {
                hint = hint.concat(abi.encodePacked(reserveIds[i]));
                if (keccak256(opcode) == keccak256(SPLIT_TRADE_OPCODE)) {
                    hint = hint.concat(abi.encodePacked(uint16(bps[i])));
                    bpsSoFar += bps[i];
                }
            }
            require((bpsSoFar == BPS) || (bpsSoFar == 0), "bps do not sum to 10000");
        }
    }

    function encodeUint(uint num) public pure returns (bytes memory hint) {
        return hint.concat(abi.encodePacked(uint16(num)));
    }
}
