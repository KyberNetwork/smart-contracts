pragma solidity ^0.4.18;


import "./ERC20Interface.sol";
import "./Withdrawable.sol";


contract VolumeImbalanceRecorder is Withdrawable {

    uint constant SLIDING_WINDOW_SIZE = 5;
    uint constant POW_2_64 = 2 ** 64;

    struct TokenControlInfo {
        uint minimalRecordResolution; // can be roughly 1 cent
        uint maxPerBlockImbalance; // in twei resolution
        uint maxTotalImbalance; // max total imbalance (without price updates)
                            // before halting trade
    }

    mapping(address => TokenControlInfo) tokenControlInfo;

    struct TokenImbalanceData {
        int64  lastBlockBuyUnitsImbalance;
        uint64 lastBlock;

        int64  totalBuyUnitsImbalance;
        uint64 lastPriceUpdateBlock;
    }

    mapping(address => mapping(uint=>uint)) tokenImbalanceData;

    function VolumeImbalanceRecorder(address _admin) public {
        admin = _admin;
    }

    function setTokenControlInfo(
        ERC20 token,
        uint minimalRecordResolution,
        uint maxPerBlockImbalance,
        uint maxTotalImbalance
    )
        public
        onlyAdmin
    {
        tokenControlInfo[token] =
            TokenControlInfo(
                minimalRecordResolution,
                maxPerBlockImbalance,
                maxTotalImbalance
            );
    }

    function getTokenControlInfo(ERC20 token) public view returns(uint, uint, uint) {
        return (tokenControlInfo[token].minimalRecordResolution,
                tokenControlInfo[token].maxPerBlockImbalance,
                tokenControlInfo[token].maxTotalImbalance);
    }

    function setGarbageToVolumeRecorder(ERC20 token) internal {
        for(uint i = 0 ; i < SLIDING_WINDOW_SIZE ; i++ ) {
            tokenImbalanceData[token][i] = 0x1;
        }
    }

    function getImbalanceInRange(ERC20 token, uint startBlock, uint endBlock) internal view returns(int buyImbalance) {
        // check the imbalance in the sliding window
        require(startBlock <= endBlock);

        buyImbalance = 0;

        for(uint windowInd = 0; windowInd < SLIDING_WINDOW_SIZE; windowInd++) {
            TokenImbalanceData memory perBlockData = decodeTokenImbalanceData(tokenImbalanceData[token][windowInd]);

            if(perBlockData.lastBlock <= endBlock && perBlockData.lastBlock >= startBlock) {
                buyImbalance += int(perBlockData.lastBlockBuyUnitsImbalance);
            }
        }
    }

    function getImbalanceSincePriceUpdate(ERC20 token, uint priceUpdateBlock, uint currentBlock)
        internal view
        returns(int buyImbalance, int currentBlockImbalance)
    {
        buyImbalance = 0;
        currentBlockImbalance = 0;
        uint64 latestBlock = uint64(0);

        for(uint windowInd = 0; windowInd < SLIDING_WINDOW_SIZE; windowInd++) {
            TokenImbalanceData memory perBlockData = decodeTokenImbalanceData(tokenImbalanceData[token][windowInd]);

            if(uint(perBlockData.lastPriceUpdateBlock) != priceUpdateBlock) continue;
            if(perBlockData.lastBlock < latestBlock) continue;

            latestBlock = perBlockData.lastBlock;
            buyImbalance = perBlockData.totalBuyUnitsImbalance;
            if(uint(perBlockData.lastBlock) == currentBlock) {
                currentBlockImbalance = perBlockData.lastBlockBuyUnitsImbalance;
            }
        }

        if(buyImbalance == 0) {
            buyImbalance = getImbalanceInRange(token, priceUpdateBlock, currentBlock);
        }
    }

    function getImbalance(ERC20 token, uint priceUpdateBlock, uint currentBlock)
        internal view
        returns(int totalImbalance, int currentBlockImbalance)
    {

        int resolution = int(tokenControlInfo[token].minimalRecordResolution);

        (totalImbalance,currentBlockImbalance) = getImbalanceSincePriceUpdate(token,
                                                                              priceUpdateBlock,
                                                                              currentBlock);
        totalImbalance *= resolution;
        currentBlockImbalance *= resolution;
    }

    function getMaxPerBlockImbalance(ERC20 token) internal view returns(uint) {
        return tokenControlInfo[token].maxPerBlockImbalance;
    }

    function getMaxTotalImbalance(ERC20 token) internal view returns(uint) {
        return tokenControlInfo[token].maxTotalImbalance;
    }

    function encodeTokenImbalanceData(TokenImbalanceData data) internal pure returns(uint){
        uint result = uint(data.lastBlockBuyUnitsImbalance) & (POW_2_64 - 1);
        result |= data.lastBlock * POW_2_64;
        result |= (uint(data.totalBuyUnitsImbalance) & (POW_2_64 - 1)) * POW_2_64 * POW_2_64;
        result |= data.lastPriceUpdateBlock * POW_2_64 * POW_2_64 * POW_2_64;
    }

    function decodeTokenImbalanceData(uint input) internal pure returns(TokenImbalanceData){
        TokenImbalanceData memory data;

        data.lastBlockBuyUnitsImbalance = int64(input & (POW_2_64 - 1));
        data.lastBlock = uint64((input / POW_2_64) & (POW_2_64 - 1));
        data.totalBuyUnitsImbalance = int64( (input / (POW_2_64 * POW_2_64)) & (POW_2_64 - 1) );
        data.lastPriceUpdateBlock = uint64( (input / (POW_2_64 * POW_2_64 * POW_2_64)) );
    }

    function addImbalance(
        ERC20 token,
        int buyAmount,
        uint priceUpdateBlock,
        uint currentBlock
    )
        internal
    {
        uint currentBlockIndex = currentBlock % SLIDING_WINDOW_SIZE;
        int64 recordedBuyAmount = int64(buyAmount / int(tokenControlInfo[token].minimalRecordResolution));

        int prevImbalance = 0;

        TokenImbalanceData memory currentBlockData = decodeTokenImbalanceData(tokenImbalanceData[token][currentBlockIndex]);

        // first scenario - this is not the first tx in the current block
        if(currentBlockData.lastBlock == currentBlock) {
            if(uint(currentBlockData.lastPriceUpdateBlock) == priceUpdateBlock) {
                // just increase imbalance
                currentBlockData.lastBlockBuyUnitsImbalance += recordedBuyAmount;
                currentBlockData.totalBuyUnitsImbalance += recordedBuyAmount;
            } else {
                // imbalance was changed in the middle of the block
                prevImbalance = getImbalanceInRange(token, priceUpdateBlock, currentBlock);
                currentBlockData.totalBuyUnitsImbalance = int64(prevImbalance) + recordedBuyAmount;
                currentBlockData.lastBlockBuyUnitsImbalance += recordedBuyAmount;
                currentBlockData.lastPriceUpdateBlock = uint64(priceUpdateBlock);
            }
        } else {
            // first tx in the current block
            int currentBlockImbalance;
            (prevImbalance, currentBlockImbalance) = getImbalanceSincePriceUpdate(token, priceUpdateBlock, currentBlock);

            currentBlockData.lastBlockBuyUnitsImbalance = recordedBuyAmount;
            currentBlockData.lastBlock = uint64(currentBlock);
            currentBlockData.lastPriceUpdateBlock = uint64(priceUpdateBlock);
            currentBlockData.totalBuyUnitsImbalance = int64(prevImbalance) + recordedBuyAmount;
        }

        tokenImbalanceData[token][currentBlockIndex] = encodeTokenImbalanceData(currentBlockData);
    }
}
