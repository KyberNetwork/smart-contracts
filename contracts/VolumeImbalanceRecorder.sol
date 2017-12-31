pragma solidity ^0.4.18;


import "./ERC20Interface.sol";
import "./Withdrawable.sol";


contract VolumeImbalanceRecorder is Withdrawable {

    uint public constant SLIDING_WINDOW_SIZE = 10;

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

    mapping(address => mapping(uint=>TokenImbalanceData)) tokenImbalanceData;

    function VolumeImbalanceRecorder(address _admin) public {
        admin = _admin;
    }

    event SetTokenControlInfo( ERC20 token,
                               uint minimalRecordResolution,
                               uint maxPerBlockImbalance,
                               uint maxTotalImbalance );

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

        SetTokenControlInfo(
            token,
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

    function getImbalanceInRange(ERC20 token, uint startBlock, uint endBlock) public view returns(int buyImbalance) {
        // check the imbalance in the sliding window
        require(startBlock <= endBlock);

        buyImbalance = 0;

        for(uint windowInd = 0 ; windowInd < SLIDING_WINDOW_SIZE ; windowInd++) {
            TokenImbalanceData memory perBlockData = tokenImbalanceData[token][windowInd];

            if(perBlockData.lastBlock <= endBlock && perBlockData.lastBlock >= startBlock) {
                buyImbalance += int(perBlockData.lastBlockBuyUnitsImbalance);
            }
        }
    }

    function getImbalanceSincePriceUpdate(ERC20 token, uint priceUpdateBlock, uint currentBlock)
        public view
        returns(int buyImbalance, int currentBlockImbalance)
    {
        buyImbalance = 0;
        currentBlockImbalance = 0;
        uint64 latestBlock = uint64(0);

        for(uint windowInd = 0 ; windowInd < SLIDING_WINDOW_SIZE ; windowInd++) {
            TokenImbalanceData memory perBlockData = tokenImbalanceData[token][windowInd];

            if(uint(perBlockData.lastPriceUpdateBlock) != priceUpdateBlock) continue;
            if(perBlockData.lastBlock < latestBlock) continue;

            latestBlock = perBlockData.lastBlock;
            buyImbalance = perBlockData.totalBuyUnitsImbalance;
            if(uint(perBlockData.lastBlock) == currentBlock) {
                currentBlockImbalance = perBlockData.lastBlockBuyUnitsImbalance;
            }
        }

        if(buyImbalance == 0) {
            buyImbalance = getImbalanceInRange( token, priceUpdateBlock, currentBlock );
        }
    }

    function getImbalance(ERC20 token, uint priceUpdateBlock, uint currentBlock)
        public view
        returns(int totalImbalance, int currentBlockImbalance)
    {

        int resolution = int(tokenControlInfo[token].minimalRecordResolution);

        (totalImbalance,currentBlockImbalance) = getImbalanceSincePriceUpdate(token,
                                                                              priceUpdateBlock,
                                                                              currentBlock);
        totalImbalance *= resolution;
        currentBlockImbalance *= resolution;
    }

    function getMaxPerBlockImbalance(ERC20 token) public view returns(uint) {
        return tokenControlInfo[token].maxPerBlockImbalance;
    }

    function getMaxTotalImbalance(ERC20 token) public view returns(uint) {
        return tokenControlInfo[token].maxTotalImbalance;
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

        TokenImbalanceData memory currentBlockData = tokenImbalanceData[token][currentBlockIndex];

        // first scenario - this is not the first tx in the current block
        if(currentBlockData.lastBlock == currentBlock) {
            if(uint(currentBlockData.lastPriceUpdateBlock) == priceUpdateBlock){
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

        tokenImbalanceData[token][currentBlockIndex] = currentBlockData;
    }
}
