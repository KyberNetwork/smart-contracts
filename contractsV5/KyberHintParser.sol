pragma solidity 0.5.11;

import "./IERC20.sol";
import "./BytesLib.sol";
import "./IKyberHint.sol";
import "./UtilsV5.sol";

//TODO: use enum hint type
contract KyberHintParser is IKyberHint, Utils {
    bytes public constant SEPARATOR = "\x00";
    bytes public constant MASK_IN_OPCODE = "\x01";
    bytes public constant MASK_OUT_OPCODE = "\x02";
    bytes public constant SPLIT_TRADE_OPCODE = "\x03";
    bytes public constant END_OPCODE = "\xaa"; //consider using hint length instead

    using BytesLib for bytes;
    
    struct ReservesHint {
        bool isSplit; // to change to boolean flag to specify
        address[] addresses;
        uint[] splitValuesBps;
    }
    
    struct TradeHint {
        ReservesHint ethToTokenReserves;
        ReservesHint tokenToEthReserves;
    }
    
    function parseHint(bytes memory hint) public view
        returns(
            bool ise2tSplit, address[] memory e2tReserves, uint[] memory e2tSplits, 
            bool ist2eSplit, address[] memory t2eReserves, uint[] memory t2eSplits,
            uint failingIndex)
    {
        TradeHint memory tradeHint;
        uint indexToContinueFrom;
        decodeOperation(hint, tradeHint, indexToContinueFrom, true);
        
        ise2tSplit = tradeHint.ethToTokenReserves.isSplit;
        e2tReserves = tradeHint.ethToTokenReserves.addresses;
        e2tSplits = tradeHint.ethToTokenReserves.splitValuesBps;
        
        ist2eSplit = tradeHint.tokenToEthReserves.isSplit;
        t2eReserves = tradeHint.tokenToEthReserves.addresses;
        t2eSplits = tradeHint.tokenToEthReserves.splitValuesBps;
        failingIndex;
    }
    
    function decodeOperation(bytes memory hint, TradeHint memory tradeHint, uint indexToContinueFrom, bool isTokenToEth) internal view {
        bytes memory opcode = hint.slice(indexToContinueFrom,1);
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
        } else if ((opcodeHash == keccak256(MASK_IN_OPCODE) || opcodeHash == keccak256(MASK_OUT_OPCODE))) {
            reserves.isSplit = false;
            (reserves.addresses, reserves.splitValuesBps, indexToContinueFrom) = decodeReservesFromHint(reserves.isSplit, hint, indexToContinueFrom);
            decodeOperation(hint, tradeHint, indexToContinueFrom, isTokenToEth);
        } else if (opcodeHash == keccak256(SPLIT_TRADE_OPCODE)) {
            reserves.isSplit = true;
            (reserves.addresses, reserves.splitValuesBps, indexToContinueFrom) = decodeReservesFromHint(reserves.isSplit, hint, indexToContinueFrom);
            decodeOperation(hint, tradeHint, indexToContinueFrom, isTokenToEth);
        } else {
            revert("Invalid hint opcode");
        }
    }
            
    function decodeReservesFromHint(bool isTokenSplit, bytes memory hint, uint indexToContinueFrom) 
        public 
        pure 
        returns 
        (address[] memory, uint[] memory, uint) 
    {
       uint reservesLength = hint.toUint8(indexToContinueFrom);
       uint bpsSoFar;
       uint[] memory splitValuesBps;
       
       address[] memory reserves = new address[](reservesLength);
       if (isTokenSplit) {
           splitValuesBps = new uint[](reservesLength);
       } else {
           splitValuesBps = new uint[](1);
           splitValuesBps[0] = BPS;
       }
       indexToContinueFrom++;
       
       for (uint i=0; i < reservesLength; i++) {
           reserves[i] = hint.toAddress(indexToContinueFrom);
           indexToContinueFrom += 20;
           if (isTokenSplit) {
               splitValuesBps[i] = uint(hint.toUint16(indexToContinueFrom));
               bpsSoFar += splitValuesBps[i];
               indexToContinueFrom += 2;
           }
       }
       require((bpsSoFar == BPS) || (bpsSoFar == 0), "bps do not sum to 10000");
       return (reserves, splitValuesBps, indexToContinueFrom);
    }
    
    function getBytes(bytes memory _hint, uint _start, uint _length) public pure returns (bytes memory) {
        return _hint.slice(_start,_length);
    }
    
    function getSingleByte(bytes memory _hint, uint _index) public pure returns (bytes memory) {
        return abi.encodePacked(_hint[_index]);
    }
    
    function buildHint(
        bytes memory e2tOpcode, address[] memory e2tReserves, uint[] memory e2tSplits, 
        bytes memory t2eOpcode, address[] memory t2eReserves, uint[] memory t2eSplits) public view returns (bytes memory hint) 
    {
        hint = hint.concat(encodeReserveInfo(t2eOpcode, t2eReserves, t2eSplits));
        hint = hint.concat(SEPARATOR);
        hint = hint.concat(encodeReserveInfo(e2tOpcode, e2tReserves, e2tSplits));
        hint = hint.concat(END_OPCODE);
    }
    
    function encodeReserveInfo(bytes memory opcode, address[] memory reserves, uint[] memory bps) public pure returns (bytes memory hint) {
        uint bpsSoFar;
        if (reserves.length > 0) {
            hint = hint.concat(opcode);
            hint = hint.concat(abi.encodePacked(uint8(reserves.length)));
            for (uint i=0; i < reserves.length; i++) {
                hint = hint.concat(abi.encodePacked(reserves[i]));
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