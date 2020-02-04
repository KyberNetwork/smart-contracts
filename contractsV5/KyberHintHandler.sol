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
        bytes8[] reserveIds;
        uint[] splitValuesBps;
        bool invalidHint;
    }

    struct TradeHint {
        ReservesHint ethToTokenReserves;
        ReservesHint tokenToEthReserves;
    }

    function parseEthToTokenHint(bytes calldata hint)
        external
        view
        returns(
            TradeType ethToTokenType,
            bytes8[] memory ethToTokenReserveIds,
            uint[] memory ethToTokenSplits,
            uint failingIndex
        )
    {
        TradeHint memory tradeHint;
        uint indexToContinueFrom;

        decodeOperation(hint, tradeHint, indexToContinueFrom, false, true);

        ethToTokenType = tradeHint.ethToTokenReserves.tradeType;
        ethToTokenReserveIds = tradeHint.ethToTokenReserves.reserveIds;        
        ethToTokenSplits = tradeHint.ethToTokenReserves.splitValuesBps;

        failingIndex = tradeHint.ethToTokenReserves.invalidHint ? indexToContinueFrom : 0;
    }

    function parseHintE2T(bytes memory hint)
        internal
        view
        returns(
            TradeType e2tType,
            IKyberReserve[] memory e2tAddresses,
            uint[] memory e2tSplits
        )
    {
        TradeHint memory tradeHint;
        uint indexToContinueFrom;

        decodeOperation(hint, tradeHint, indexToContinueFrom, false, false);

        require(!tradeHint.ethToTokenReserves.invalidHint, "Invalid hint");

        e2tType = tradeHint.ethToTokenReserves.tradeType;
        e2tAddresses = tradeHint.ethToTokenReserves.addresses;        
        e2tSplits = tradeHint.ethToTokenReserves.splitValuesBps;
    }

    function parseTokenToEthHint(bytes calldata hint)
        external
        view
        returns(
            TradeType tokenToEthType,
            bytes8[] memory tokenToEthReserveIds,
            uint[] memory tokenToEthSplits,
            uint failingIndex
        )
    {
        TradeHint memory tradeHint;
        uint indexToContinueFrom;

        decodeOperation(hint, tradeHint, indexToContinueFrom, true, true);

        tokenToEthType = tradeHint.tokenToEthReserves.tradeType;
        tokenToEthReserveIds = tradeHint.tokenToEthReserves.reserveIds;
        tokenToEthSplits = tradeHint.tokenToEthReserves.splitValuesBps;

        failingIndex = tradeHint.tokenToEthReserves.invalidHint ? indexToContinueFrom : 0;
    }

    function parseHintT2E(bytes memory hint)
        internal
        view
        returns(
            TradeType t2eType,
            IKyberReserve[] memory t2eAddresses,
            uint[] memory t2eSplits
        )
    {
        TradeHint memory tradeHint;
        uint indexToContinueFrom;

        decodeOperation(hint, tradeHint, indexToContinueFrom, true, false);

        require(!tradeHint.tokenToEthReserves.invalidHint, "Invalid hint");

        t2eType = tradeHint.tokenToEthReserves.tradeType;
        t2eAddresses = tradeHint.tokenToEthReserves.addresses;
        t2eSplits = tradeHint.tokenToEthReserves.splitValuesBps;
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
            uint failingIndex
        )
    {
        TradeHint memory tradeHint;
        uint indexToContinueFrom;

        decodeOperation(hint, tradeHint, indexToContinueFrom, true, true);

        ethToTokenType = tradeHint.ethToTokenReserves.tradeType;
        ethToTokenReserveIds = tradeHint.ethToTokenReserves.reserveIds;
        ethToTokenSplits = tradeHint.ethToTokenReserves.splitValuesBps;

        tokenToEthType = tradeHint.tokenToEthReserves.tradeType;
        tokenToEthReserveIds = tradeHint.tokenToEthReserves.reserveIds;
        tokenToEthSplits = tradeHint.tokenToEthReserves.splitValuesBps;

        failingIndex = tradeHint.tokenToEthReserves.invalidHint || tradeHint.tokenToEthReserves.invalidHint ? indexToContinueFrom : 0;
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

        decodeOperation(hint, tradeHint, indexToContinueFrom, true, false);

        require(!tradeHint.tokenToEthReserves.invalidHint || !tradeHint.ethToTokenReserves.invalidHint, "Invalid hint");

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
            require((bpsSoFar == BPS) || (bpsSoFar == 0), "bps do not sum to 10000");
        }
    }

    function decodeOperation(
        bytes memory hint,
        TradeHint memory tradeHint,
        uint indexToContinueFrom,
        bool isTokenToEth,
        bool isExternal
    )
        internal
        view
    {
        bytes memory opcode = hint.slice(indexToContinueFrom, 1);
        bytes32 opcodeHash = keccak256(opcode);
        ReservesHint memory reservesHint;

        if (isTokenToEth) {
            reservesHint = tradeHint.tokenToEthReserves;
        } else {
            reservesHint = tradeHint.ethToTokenReserves;
        }

        indexToContinueFrom += 1;
        reservesHint.invalidHint = false;

        if (opcodeHash == END_KECCAK) {
            return;
        } else if (opcodeHash == SEPARATOR_KECCAK) {
            decodeOperation(hint, tradeHint, indexToContinueFrom, false, isExternal);
        } else if (opcodeHash == MASK_IN_KECCAK) {
            reservesHint.tradeType = TradeType.MaskIn;
            (indexToContinueFrom) = decodeReservesFromHint(false, hint, reservesHint, isExternal, indexToContinueFrom);
            decodeOperation(hint, tradeHint, indexToContinueFrom, isTokenToEth, isExternal);
        } else if (opcodeHash == MASK_OUT_KECCAK) {
            reservesHint.tradeType = TradeType.MaskOut;
            (indexToContinueFrom) = decodeReservesFromHint(false, hint, reservesHint, isExternal, indexToContinueFrom);
            decodeOperation(hint, tradeHint, indexToContinueFrom, isTokenToEth, isExternal);
        } else if (opcodeHash == SPLIT_TRADE_KECCAK) {
            reservesHint.tradeType = TradeType.Split;
            (indexToContinueFrom) = decodeReservesFromHint(true, hint, reservesHint, isExternal, indexToContinueFrom);
            decodeOperation(hint, tradeHint, indexToContinueFrom, isTokenToEth, isExternal);
        } else {            
            reservesHint.invalidHint = true;
        }
    }

    function decodeReservesFromHint(
        bool isTokenSplit,
        bytes memory hint,
        ReservesHint memory reservesHint,
        bool isExternal,
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
       bytes8[] memory reserveIds = new bytes8[](reservesLength);

       if (isTokenSplit) {
           splitValuesBps = new uint[](reservesLength);
       } else {
           splitValuesBps = new uint[](1);
           splitValuesBps[0] = BPS;
       }

       indexToContinueFrom++;

       for (uint i = 0; i < reservesLength; i++) {
           reserveIds[i] = hint.slice(indexToContinueFrom, RESERVE_ID_LENGTH).toBytes8(0);

           if (!isExternal) {
               addresses[i] = IKyberReserve(convertReserveIdToAddress(reserveIds[i]));
           }

           indexToContinueFrom += RESERVE_ID_LENGTH;

           if (isTokenSplit) {
               splitValuesBps[i] = uint(hint.toUint16(indexToContinueFrom));
               bpsSoFar += splitValuesBps[i];
               indexToContinueFrom += 2;
           }
       }

       require((bpsSoFar == BPS) || (bpsSoFar == 0), "bps do not sum to 10000");

       reservesHint.splitValuesBps = splitValuesBps;
       if (isExternal) {
           reservesHint.reserveIds = reserveIds;
       } else {
           reservesHint.addresses = addresses;
       }

       return (indexToContinueFrom);
    }

    function encodeOpcode(TradeType h) internal pure returns (bytes memory) {
        if (h == TradeType.MaskIn) {
            return MASK_IN_OPCODE;
        } else if (h == TradeType.MaskOut) {
            return MASK_OUT_OPCODE;
        } else if (h == TradeType.Split) {
            return SPLIT_TRADE_OPCODE;
        }
    }

    function convertReserveIdToAddress(bytes8 reserveId) internal view returns (address) {}
}
