pragma solidity 0.5.11;

import "./BytesLib.sol";
import "./UtilsV5.sol";
import "./IERC20.sol";
import "./IKyberReserve.sol";

contract KyberHintParser is Utils {
    bytes public constant SEPARATOR = "\x00";
    bytes public constant MASK_IN_OPCODE = "\x01";
    bytes public constant MASK_OUT_OPCODE = "\x02";
    bytes public constant SPLIT_TRADE_OPCODE = "\x03";
    bytes public constant END_OPCODE = "\xee";
    uint8 public constant RESERVE_ID_LENGTH = 5;

    using BytesLib for bytes;

    enum TradeType {
        MaskIn,
        MaskOut,
        Split
    }

    struct ReservesHint {
        TradeType tradeType;
        IKyberReserve[] addresses;
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
            IKyberReserve[] memory ethToTokenAddresses,
            uint[] memory ethToTokenSplits
        )
    {
        TradeHint memory tradeHint;
        uint indexToContinueFrom;

        decodeOperation(hint, tradeHint, indexToContinueFrom, false);

        ethToTokenType = tradeHint.ethToTokenReserves.tradeType;
        ethToTokenAddresses = tradeHint.ethToTokenReserves.addresses;
        ethToTokenSplits = tradeHint.ethToTokenReserves.splitValuesBps;
    }

    function parseTokenToEthHint(bytes memory hint)
        public
        view
        returns(
            TradeType tokenToEthType,
            IKyberReserve[] memory tokenToEthAddresses,
            uint[] memory tokenToEthSplits
        )
    {
        TradeHint memory tradeHint;
        uint indexToContinueFrom;

        decodeOperation(hint, tradeHint, indexToContinueFrom, true);

        tokenToEthType = tradeHint.tokenToEthReserves.tradeType;
        tokenToEthAddresses = tradeHint.tokenToEthReserves.addresses;
        tokenToEthSplits = tradeHint.tokenToEthReserves.splitValuesBps;
    }

    function parseTokenToTokenHint(bytes memory hint)
        public
        view
        returns(
            TradeType tokenToEthType,
            IKyberReserve[] memory tokenToEthAddresses,
            uint[] memory tokenToEthSplits,
            TradeType ethToTokenType,
            IKyberReserve[] memory ethToTokenAddresses,
            uint[] memory ethToTokenSplits
        )
    {
        TradeHint memory tradeHint;
        uint indexToContinueFrom;

        decodeOperation(hint, tradeHint, indexToContinueFrom, true);

        ethToTokenType = tradeHint.ethToTokenReserves.tradeType;
        ethToTokenAddresses = tradeHint.ethToTokenReserves.addresses;
        ethToTokenSplits = tradeHint.ethToTokenReserves.splitValuesBps;

        tokenToEthType = tradeHint.tokenToEthReserves.tradeType;
        tokenToEthAddresses = tradeHint.tokenToEthReserves.addresses;
        tokenToEthSplits = tradeHint.tokenToEthReserves.splitValuesBps;
    }

    function buildEthToTokenHint(
        TradeType ethToTokenType,
        address[] memory ethToTokenAddresses,
        uint[] memory ethToTokenSplits
    )
        public
        pure
        returns(bytes memory hint)
    {
        hint = hint.concat(SEPARATOR);
        hint = hint.concat(encodeReserveInfo(ethToTokenType, ethToTokenAddresses, ethToTokenSplits));
        hint = hint.concat(END_OPCODE);
    }

    function buildTokenToEthHint(
        TradeType tokenToEthType,
        address[] memory tokenToEthAddresses,
        uint[] memory tokenToEthSplits
    )
        public
        pure
        returns(bytes memory hint)
    {
        hint = hint.concat(encodeReserveInfo(tokenToEthType, tokenToEthAddresses, tokenToEthSplits));
        hint = hint.concat(SEPARATOR);
        hint = hint.concat(END_OPCODE);
    }

    function buildTokenToTokenHint(
        TradeType tokenToEthType,
        address[] memory tokenToEthAddresses,
        uint[] memory tokenToEthSplits,
        TradeType ethToTokenType,
        address[] memory ethToTokenAddresses,
        uint[] memory ethToTokenSplits
    )
        public
        pure
        returns(bytes memory hint)
    {
        hint = hint.concat(encodeReserveInfo(tokenToEthType, tokenToEthAddresses, tokenToEthSplits));
        hint = hint.concat(SEPARATOR);
        hint = hint.concat(encodeReserveInfo(ethToTokenType, ethToTokenAddresses, ethToTokenSplits));
        hint = hint.concat(END_OPCODE);
    }

    function encodeReserveInfo(
        TradeType opcode,
        address[] memory addresses,
        uint[] memory bps
    )
        internal
        pure
        returns (bytes memory hint)
    {
        uint bpsSoFar;
        if (addresses.length > 0) {
            hint = hint.concat(parseOpcode(opcode));
            hint = hint.concat(abi.encodePacked(uint8(addresses.length)));
            for (uint i = 0; i < addresses.length; i++) {
                hint = hint.concat(abi.encodePacked(addresses[i]));
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
            (reserves.addresses, reserves.splitValuesBps, indexToContinueFrom) = decodeReservesFromHint(false, hint, indexToContinueFrom);
            decodeOperation(hint, tradeHint, indexToContinueFrom, isTokenToEth);
        } else if (opcodeHash == keccak256(parseOpcode(TradeType.MaskOut))) {
            reserves.tradeType = TradeType.MaskOut;
            (reserves.addresses, reserves.splitValuesBps, indexToContinueFrom) = decodeReservesFromHint(false, hint, indexToContinueFrom);
            decodeOperation(hint, tradeHint, indexToContinueFrom, isTokenToEth);
        } else if (opcodeHash == keccak256(parseOpcode(TradeType.Split))) {
            reserves.tradeType = TradeType.Split;
            (reserves.addresses, reserves.splitValuesBps, indexToContinueFrom) = decodeReservesFromHint(true, hint, indexToContinueFrom);
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
        view
        returns (
            IKyberReserve[] memory,
            uint[] memory,
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
           addresses[i] = IKyberReserve(convertReserveIdToAddress(hint.slice(indexToContinueFrom, RESERVE_ID_LENGTH).toBytes5(0)));
           indexToContinueFrom += RESERVE_ID_LENGTH;
           if (isTokenSplit) {
               splitValuesBps[i] = uint(hint.toUint16(indexToContinueFrom));
               bpsSoFar += splitValuesBps[i];
               indexToContinueFrom += 2;
           }
       }
       require((bpsSoFar == BPS) || (bpsSoFar == 0), "bps do not sum to 10000");
       return (addresses, splitValuesBps, indexToContinueFrom);
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

    function convertReserveIdToAddress(bytes5 reserveId) internal view returns (address) {}
}
