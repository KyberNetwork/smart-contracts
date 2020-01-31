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
    uint8 public constant RESERVE_ID_LENGTH = 5;

    using BytesLib for bytes;

    struct ReservesHint {
        TradeType tradeType;
        bytes5[] reserveIds;
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
            TradeType ethToTokenType,
            bytes5[] memory ethToTokenReserveIds,
            uint[] memory ethToTokenSplits
        )
    {
        TradeHint memory tradeHint;
        uint indexToContinueFrom;

        decodeOperation(hint, tradeHint, indexToContinueFrom, false);

        ethToTokenType = tradeHint.ethToTokenReserves.tradeType;
        ethToTokenReserveIds = tradeHint.ethToTokenReserves.reserveIds;
        ethToTokenSplits = tradeHint.ethToTokenReserves.splitValuesBps;
    }

    function parseTokenToEthHint(bytes memory hint)
        public
        view
        returns(
            TradeType tokenToEthType,
            bytes5[] memory tokenToEthReserveIds,
            uint[] memory tokenToEthSplits
        )
    {
        TradeHint memory tradeHint;
        uint indexToContinueFrom;

        decodeOperation(hint, tradeHint, indexToContinueFrom, true);

        tokenToEthType = tradeHint.tokenToEthReserves.tradeType;
        tokenToEthReserveIds = tradeHint.tokenToEthReserves.reserveIds;
        tokenToEthSplits = tradeHint.tokenToEthReserves.splitValuesBps;
    }

    function parseTokenToTokenHint(bytes memory hint)
        public
        view
        returns(
            TradeType tokenToEthType,
            bytes5[] memory tokenToEthReserveIds,
            uint[] memory tokenToEthSplits,
            TradeType ethToTokenType,
            bytes5[] memory ethToTokenReserveIds,
            uint[] memory ethToTokenSplits
        )
    {
        TradeHint memory tradeHint;
        uint indexToContinueFrom;

        decodeOperation(hint, tradeHint, indexToContinueFrom, true);

        ethToTokenType = tradeHint.ethToTokenReserves.tradeType;
        ethToTokenReserveIds = tradeHint.ethToTokenReserves.reserveIds;
        ethToTokenSplits = tradeHint.ethToTokenReserves.splitValuesBps;

        tokenToEthType = tradeHint.tokenToEthReserves.tradeType;
        tokenToEthReserveIds = tradeHint.tokenToEthReserves.reserveIds;
        tokenToEthSplits = tradeHint.tokenToEthReserves.splitValuesBps;
    }

    function buildEthToTokenHint(
        TradeType ethToTokenType,
        bytes5[] memory ethToTokenReserveIds,
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
        TradeType tokenToEthType,
        bytes5[] memory tokenToEthReserveIds,
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
        TradeType tokenToEthType,
        bytes5[] memory tokenToEthReserveIds,
        uint[] memory tokenToEthSplits,
        TradeType ethToTokenType,
        bytes5[] memory ethToTokenReserveIds,
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

    function reserveAddressToReserveId(address reserveAddress)
        external
        view
        returns (bytes5 reserveId)
    {
        // return reserveAddressToId[reserveAddress];
    }

    function reserveIdToReserveAddress(bytes5 reserveId)
        external
        view
        returns (address reserveAddress)
    {
        // return reserveIdToAddresses[reserveId];
    }

    function getBytes(bytes memory _hint, uint _start, uint _length) public pure returns (bytes memory) {
        return _hint.slice(_start, _length);
    }

    function getSingleByte(bytes memory _hint, uint _index) public pure returns (bytes memory) {
        return abi.encodePacked(_hint[_index]);
    }

    function encodeUint(uint num) public pure returns (bytes memory hint) {
        return hint.concat(abi.encodePacked(uint16(num)));
    }

    function encodeReserveInfo(
        TradeType opcode,
        bytes5[] memory reserveIds,
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
                if (keccak256(parseOpcode(opcode)) == keccak256(parseOpcode(TradeType.Split))) {
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
        } else if (opcodeHash == keccak256(parseOpcode(TradeType.MaskIn))) {
            reserves.tradeType = TradeType.MaskIn;
            (reserves.reserveIds, reserves.splitValuesBps, indexToContinueFrom) = decodeReservesFromHint(false, hint, indexToContinueFrom);
            decodeOperation(hint, tradeHint, indexToContinueFrom, isTokenToEth);
        } else if (opcodeHash == keccak256(parseOpcode(TradeType.MaskOut))) {
            reserves.tradeType = TradeType.MaskOut;
            (reserves.reserveIds, reserves.splitValuesBps, indexToContinueFrom) = decodeReservesFromHint(false, hint, indexToContinueFrom);
            decodeOperation(hint, tradeHint, indexToContinueFrom, isTokenToEth);
        } else if (opcodeHash == keccak256(parseOpcode(TradeType.Split))) {
            reserves.tradeType = TradeType.Split;
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
            bytes5[] memory,
            uint[] memory,
            uint
        )
    {
       uint reservesLength = hint.toUint8(indexToContinueFrom);
       uint bpsSoFar;
       uint[] memory splitValuesBps;

       bytes5[] memory reserveIds = new bytes5[](reservesLength);
       if (isTokenSplit) {
           splitValuesBps = new uint[](reservesLength);
       } else {
           splitValuesBps = new uint[](1);
           splitValuesBps[0] = BPS;
       }
       indexToContinueFrom++;

       for (uint i = 0; i < reservesLength; i++) {
           reserveIds[i] = hint.slice(indexToContinueFrom, RESERVE_ID_LENGTH).toBytes5(0);
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

    function parseOpcode(TradeType h) internal pure returns (bytes memory) {
        if (h == TradeType.MaskIn) {
            return MASK_IN_OPCODE;
        } else if (h == TradeType.MaskOut) {
            return MASK_OUT_OPCODE;
        } else if (h == TradeType.Split) {
            return SPLIT_TRADE_OPCODE;
        }
    }
}
