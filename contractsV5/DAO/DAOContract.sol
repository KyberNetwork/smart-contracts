pragma solidity 0.5.11;

import "../EpochUtils.sol";
import "../IERC20.sol";
import "../staking/IKyberStaking.sol";
import "./IKyberDAO.sol";
import "../PermissionGroupsV5.sol";
import "../ReentrancyGuard.sol";
import "../UtilsV5.sol";


interface IFeeHandler {
    function claimReward(address staker, uint epoch, uint percentageInBps) external returns(bool);
}

// Assumption:
// - Network fee camp: options are fee in bps
// - BRR fee handler camp: options are conbimed of rebate (first 128 bits) + reward (last 128 bits)
// - General camp: options are from 1 to num_options
contract DAOContract is IKyberDAO, PermissionGroups, EpochUtils, ReentrancyGuard, Utils {

    // Constants
    uint internal constant BPS = 10000;
    uint internal constant POWER_128 = 2 ** 128;
    uint internal constant POWER_84 = 2 ** 84;
    // max number of camps for each epoch
    uint public constant MAX_EPOCH_CAMPS = 10;

    uint public MAX_CAMP_OPTIONS = 4; // TODO: Finalise the value
    uint public MIN_CAMP_DURATION = 75000; // around 2 weeks time. TODO: Finalise the value

    IERC20 public KNC_TOKEN;
    IKyberStaking public staking;
    IFeeHandler public feeHandler;

    enum CampaignType { GENERAL, NETWORK_FEE, FEE_HANDLER_BRR }

    struct FormulaData {
        uint minPercentageInPrecision;
        uint cInPrecision;
        uint tInPrecision;
    }

    struct Campaign {
        CampaignType campType;
        uint campID;
        uint startBlock;
        uint endBlock;
        uint totalKNCSupply;    // total KNC supply at the time campaign was created
        uint formulaParams;     // squeezing formula params into one number
        bytes link;             // link to KIP, explaination of options, etc.
        uint[] options;         // data of options
    }

    /* Mapping from campaign ID => data */
    // use to generate increasing camp ID
    uint public numberCampaigns = 0;
    mapping(uint => bool) public isCampExisted;
    mapping(uint => Campaign) internal campaignData;
    // use index 0 for total points, index 1 -> ... for each option ID
    mapping(uint => uint[]) internal campaignOptionPoints;
    // winning option data for each campaign
    // 128 bits: has concluded campaign or not, last 128 bits: winning option ID
    mapping(uint => uint) internal winningOptionData;

    /** Mapping from epoch => data */
    // list camp IDs for each epoch (epoch => camp IDs)
    mapping(uint => uint[]) internal epochCampaigns;
    // total points for an epoch (epoch => total points)
    mapping(uint => uint) internal totalEpochPoints;

    // number of votes at an epoch for each address (address => epoch => number votes)
    mapping(address => mapping(uint => uint)) public numberVotes;
    // whether a staker has claimed reward for an epoch (address => camp => has claimed)
    mapping(address => mapping(uint => bool)) public hasClaimedReward;
    // staker's voted option for a camp, vote option must start from 1 (address => campID => option ID)
    mapping(address => mapping(uint => uint)) public stakerVotedOption;

    /* Configuration Campaign Data */
    // epoch => campID for network fee campaign
    uint public latestNetworkFeeResult = 25; // 0.25%
    mapping(uint => uint) public networkFeeCampaign;
    // epoch => campID for brr campaign
    uint public latestBrrResult = 0; // 0: 0% reward + 0% rebate
    mapping(uint => uint) public brrCampaign;

    constructor(
        uint _epochPeriod, uint _startBlock,
        address _staking, address _feeHandler, address _knc,
        uint _defaultNetworkFee, uint _defaultBrrData,
        address _admin
    )
        PermissionGroups(_admin) public
    {
        require(_epochPeriod > 0, "constructor: epoch period must be positive");
        require(_startBlock >= block.number, "constructor: startBlock shouldn't be in the past");
        require(_staking != address(0), "constructor: staking address is missing");
        require(_feeHandler != address(0), "constructor: feeHandler address is missing");
        require(_knc != address(0), "constructor: knc address is missing");
        require(_admin != address(0), "constructor: admin address is missing");
        require(_defaultNetworkFee <= BPS, "constructor: default network fee must not be greater than 100%");

        (uint rebateBps, uint rewardBps) = getRebateAndRewardFromData(_defaultBrrData);
        require(rebateBps + rewardBps <= BPS, "constructor: default rebate + reward must not be greater than 100%");

        EPOCH_PERIOD = _epochPeriod;
        START_BLOCK = _startBlock;
        staking = IKyberStaking(_staking);
        feeHandler = IFeeHandler(_feeHandler);
        KNC_TOKEN = IERC20(_knc);
        latestNetworkFeeResult = _defaultNetworkFee;
        latestBrrResult = _defaultBrrData;
    }

    function handleWithdrawal(address staker, uint penaltyAmount) public {
        require(msg.sender == address(staking), "handleWithdrawal: only staking contract can call this func");
        if (penaltyAmount == 0) { return; }
        uint curEpoch = getCurrentEpochNumber();

        // update total points for epoch
        uint numVotes = numberVotes[staker][curEpoch];
        if (numVotes == 0) { return; }

        totalEpochPoints[curEpoch] -= numVotes * penaltyAmount;

        // update voted count for each camp staker has voted
        uint[] memory campIDs = epochCampaigns[curEpoch];
        for(uint i = 0; i < campIDs.length; i++) {
            uint campID = campIDs[i];
            uint votedOption = stakerVotedOption[staker][campID];
            // deduce vote count for current running campaign that this staker has voted
            if (votedOption > 0 && campaignData[campID].endBlock >= block.number) {
                // user already voted for this camp and the camp is not ended
                campaignOptionPoints[campID][0] -= penaltyAmount;
                campaignOptionPoints[campID][votedOption] -= penaltyAmount;
            }
        }
    }

    event NewCampaignCreated(
        CampaignType campType, uint campID,
        uint startBlock, uint endBlock, uint formulaParams,
        uint[] options, bytes link
    );
    function submitNewCampaign(
        CampaignType campType, uint startBlock, uint endBlock, uint formulaParams,
        uint[] memory options, bytes memory link
    )
        public onlyAdmin returns(uint campID) 
    {
        uint curEpoch = getCurrentEpochNumber();

        require(epochCampaigns[curEpoch].length < MAX_EPOCH_CAMPS, "submitNewCampaign: exceed max number camps for each epoch");

        require(
            validateCampaignParams(campType, startBlock, endBlock, curEpoch, formulaParams, options),
            "submitNewCampaign: validate camp params failed"
        );

        if (campType == CampaignType.NETWORK_FEE) {
            require(networkFeeCampaign[curEpoch] == 0, "submitNewCampaign: already had one camp for network fee at this epoch");
        } else if (campType == CampaignType.FEE_HANDLER_BRR) {
            require(brrCampaign[curEpoch] == 0, "submitNewCampaign: already had one camp for brr at this epoch");
        }

        numberCampaigns += 1;
        campID = numberCampaigns;

        // add campID into this current epoch camp IDs
        epochCampaigns[curEpoch].push(campID);

        campaignData[campID] = Campaign({
            campID: campID,
            campType: campType,
            startBlock: startBlock,
            endBlock: endBlock,
            totalKNCSupply: KNC_TOKEN.totalSupply(),
            link: link,
            formulaParams: formulaParams,
            options: options
        });

        isCampExisted[campID] = true;

        if (campType == CampaignType.NETWORK_FEE) {
            networkFeeCampaign[curEpoch] = campID;
        } else if (campType == CampaignType.FEE_HANDLER_BRR) {
            brrCampaign[curEpoch] = campID;
        }

        // index 0 for total votes, index 1 -> options.length for each option
        campaignOptionPoints[campID] = new uint[](options.length + 1);
    
        emit NewCampaignCreated(CampaignType.NETWORK_FEE, campID, startBlock, endBlock, formulaParams, options, link);
    }

    event CancelledCampaign(uint campID);
    function cancelCampaign(uint campID) public onlyAdmin {
        require(isCampExisted[campID], "cancelCampaign: campID is not existed");

        Campaign storage camp = campaignData[campID];

        require(camp.startBlock > block.number, "cancelCampaign: campaign has started, can not cancel");

        uint curEpoch = getCurrentEpochNumber();

        isCampExisted[campID] = false;

        if (camp.campType == CampaignType.NETWORK_FEE) {
            delete networkFeeCampaign[curEpoch];
        } else if (camp.campType == CampaignType.FEE_HANDLER_BRR) {
            delete brrCampaign[curEpoch];
        }

        delete campaignData[campID];
        delete campaignOptionPoints[campID];

        uint[] storage campIDs = epochCampaigns[curEpoch];
        for(uint i = 0; i < campIDs.length; i++) {
            if (campIDs[i] == campID) {
                // remove this camp id out of list
                campIDs[i] = campIDs[campIDs.length - 1];
                delete campIDs[campIDs.length - 1];
                campIDs.length--;
                break;
            }
        }

        emit CancelledCampaign(campID);
    }

    event Voted(address staker, uint epoch, uint campID, uint option);
    function vote(uint campID, uint option) public returns(bool) {
        require(validateVoteOption(campID, option), "vote: campID or vote option is invalid");
        address staker = msg.sender;

        uint curEpoch = getCurrentEpochNumber();
        (uint stake, uint delegatedStake, address delegatedAddr) = staking.initAndReturnStakerDataForCurrentEpoch(staker);

        uint totalStake = delegatedAddr == staker ? stake + delegatedStake : delegatedStake;
        uint lastVotedOption = stakerVotedOption[staker][campID];

        if (lastVotedOption == 0) {
            // increase number campaigns that the staker has voted for first time voted
            numberVotes[staker][curEpoch]++;

            totalEpochPoints[curEpoch] += totalStake;
            // increase voted points for this option
            campaignOptionPoints[campID][option] += totalStake;
            // increase total voted points
            campaignOptionPoints[campID][0] += totalStake;
        } else if (lastVotedOption != option) {
            // deduce previous option voted count
            campaignOptionPoints[campID][lastVotedOption] -= totalStake;
            // increase new option voted count
            campaignOptionPoints[campID][option] += totalStake;
        }

        stakerVotedOption[staker][campID] = option;

        emit Voted(staker, curEpoch, campID, option);
    }

    event RewardClaimed(address staker, uint epoch, uint percentageInPrecision);
    function claimReward(address staker, uint epoch) public nonReentrant {
        require(address(feeHandler) != address(0), "claimReward: feeHandler address is missing");

        uint curEpoch = getCurrentEpochNumber();
        require(epoch >= curEpoch, "claimReward: can not claim for current or future epoch");
        require(!hasClaimedReward[staker][epoch], "claimReward: already claimed reward for this epoch");

        uint numVotes = numberVotes[staker][epoch];
        // no votes, no rewards
        require(numVotes > 0, "claimReward: no votes, no rewards");

        (uint stake, uint delegatedStake, address delegatedAddr) = staking.getStakerDataForPastEpoch(staker, epoch);
        uint totalStake = delegatedAddr == staker ? stake + delegatedStake : delegatedStake;
        require(totalStake > 0, "claimReward: total stakes is 0, no reward");

        uint points = numVotes * totalStake;
        uint totalPts = totalEpochPoints[epoch];
        require(totalPts > 0, "claimReward: total points is 0, can not claim reward");

        require(points <= totalPts, "claimReward: points should not be greater than total points");
        uint percentageInPrecision = points * PRECISION / totalPts;

        require(feeHandler.claimReward(staker, epoch, percentageInPrecision), "claimReward: feeHandle failed to claim reward");

        hasClaimedReward[staker][epoch] = true;
        emit RewardClaimed(staker, epoch, percentageInPrecision);
    }

    function getLatestNetworkFeeDataWithCache() public returns(uint feeInBps, uint expiryBlockNumber) {
        uint curEpoch = getCurrentEpochNumber();

        feeInBps = latestNetworkFeeResult;
        expiryBlockNumber = START_BLOCK + curEpoch * EPOCH_PERIOD - 1;

        // there is no camp for epoch 0
        if (curEpoch == 0) {
            return (feeInBps, expiryBlockNumber);
        }

        uint campID = networkFeeCampaign[curEpoch - 1];
        if (campID == 0) {
            // not have network fee campaign, return latest result
            return (feeInBps, expiryBlockNumber);
        }

        uint winningOption;
        (winningOption, feeInBps) = getCampaignWinningOptionAndValue(campID);
        // save latest winning option data
        winningOptionData[campID] = encodeWinningOptionData(winningOption, true);

        if (winningOption == 0) {
            // no winning option, fall back to previous result
            feeInBps = latestNetworkFeeResult;
        } else {
            // update latest result based on new winning option
            latestNetworkFeeResult = feeInBps;
        }
    }

    // return latest burn/reward/rebate data, also affecting epoch + expiry block number
    function getLatestBRRData()
        public
        returns(uint burnInBps, uint rewardInBps, uint rebateInBps, uint epoch, uint expiryBlockNumber)
    {
        epoch = getCurrentEpochNumber();
        expiryBlockNumber = START_BLOCK + epoch * EPOCH_PERIOD - 1;
        uint brrData = latestBrrResult;
        if (epoch > 0) {
            uint campID = brrCampaign[epoch - 1];
            if (campID != 0) {
                uint winningOption;
                (winningOption, brrData) = getCampaignWinningOptionAndValue(campID);
                // save latest winning option data
                winningOptionData[campID] = encodeWinningOptionData(winningOption, true);
                if (winningOption == 0) {
                    // no winning option, fallback to previous result
                    brrData = latestBrrResult;
                } else {
                    // concluded campaign, updated new latest brr result
                    latestBrrResult = brrData;
                }
            }
        }

        (rebateInBps, rewardInBps) = getRebateAndRewardFromData(brrData);
        burnInBps = BPS - rebateInBps - rewardInBps;
    }

    // if total points for that epoch is 0, should burn all reward since no campaign or no one voted
    function shouldBurnRewardForEpoch(uint epoch) public view returns(bool) {
        uint curEpoch = getCurrentEpochNumber();
        if (epoch >= curEpoch) { return false; }
        return totalEpochPoints[epoch] == 0;
    }

    function getCampaignDetails(uint campID)
        public view
        returns(
            CampaignType campType, uint startBlock, uint endBlock,
            uint totalKNCSupply, uint formulaParams, bytes memory link, uint[] memory options
        )
    {
        Campaign storage camp = campaignData[campID];
        campType = camp.campType;
        startBlock = camp.startBlock;
        endBlock = camp.endBlock;
        totalKNCSupply = camp.totalKNCSupply;
        formulaParams = camp.formulaParams;
        link = camp.link;
        options = camp.options;
    }

    function getCampaignVoteCountData(uint campID) public view returns(uint[] memory voteCounts, uint totalVoteCount) {
        uint[] memory votes = campaignOptionPoints[campID];
        if (votes.length == 0) {
            return (voteCounts, totalVoteCount);
        }
        totalVoteCount = votes[0];
        voteCounts = new uint[](votes.length - 1);
        for(uint i = 0; i < voteCounts.length; i++) {
            voteCounts[i] = votes[i + 1];
        }
    }

    function getCampaignOptionVoteCount(uint campID, uint optionID) public view returns(uint voteCount, uint totalVoteCount) {
        uint[] memory voteCounts = campaignOptionPoints[campID];
        if (voteCounts.length == 0 || optionID == 0 || optionID >= voteCounts.length) {
            return (voteCount, totalVoteCount);
        }
        voteCount = voteCounts[optionID];
        totalVoteCount = voteCounts[0];
    }

    function getCampaignWinningOptionAndValue(uint campID) public view returns(uint optionID, uint value) {
        if (!isCampExisted[campID]) { return (0, 0); } // not existed

        Campaign storage camp = campaignData[campID];

        // not found or not ended yet, return 0 as winning option
        if (camp.endBlock == 0 || camp.endBlock > block.number) { return (0, 0); }

        bool hasConcluded;
        (hasConcluded, optionID) = decodeWinningOptionData(winningOptionData[campID]);
        if (hasConcluded) {
            if (optionID == 0 || optionID >= camp.options.length) {
                // no winning option or invalid winning option
                return (0, 0);
            }
            return (optionID, camp.options[optionID]);
        }

        uint totalSupply = camp.totalKNCSupply;
        // no one has voted in this epoch, 
        if (totalSupply == 0) { return (0, 0); }

        uint[] memory voteCounts = campaignOptionPoints[campID];

        // Finding option with most votes
        uint winningOption = 0;
        uint maxVotedCount = 0;
        for(uint i = 1; i < voteCounts.length; i++) {
            if (voteCounts[i] > maxVotedCount) {
                winningOption = i;
                maxVotedCount = voteCounts[i];
            } else if (voteCounts[i] == maxVotedCount) {
                winningOption = 0;
            }
        }
        // more than 1 options have same vote count
        if (winningOption == 0) { return (0, 0); }

        FormulaData memory formulaData = decodeFormulaParams(camp.formulaParams);

        uint totalVotes = voteCounts[0];
        uint votedPercentageInPrecision = totalVotes * PRECISION / camp.totalKNCSupply;

        if (formulaData.minPercentageInPrecision < votedPercentageInPrecision) { return (0, 0); }

        uint X = formulaData.tInPrecision * votedPercentageInPrecision / PRECISION;
        if (X <= formulaData.cInPrecision) {
            // threshold is not negative, need to compare with voted count
            uint Y = formulaData.cInPrecision - X;
            if (maxVotedCount * PRECISION < Y * totalVotes) { return (0, 0); }
        }

        optionID = winningOption;
        value = camp.options[optionID - 1];
    }

    // return latest network fee with expiry block number
    function getLatestNetworkFeeData() public view returns(uint feeInBps, uint expiryBlockNumber) {
        uint curEpoch = getCurrentEpochNumber();
        feeInBps = latestNetworkFeeResult;
        expiryBlockNumber = START_BLOCK + curEpoch * EPOCH_PERIOD - 1;
        if (curEpoch == 0) {
            return (feeInBps, expiryBlockNumber);
        }
        uint campID = networkFeeCampaign[curEpoch - 1];
        if (campID == 0) {
            // not have network fee campaign, return latest result
            return (feeInBps, expiryBlockNumber);
        }

        uint winningOption;
        (winningOption, feeInBps) = getCampaignWinningOptionAndValue(campID);
        if (winningOption == 0) {
            feeInBps = latestNetworkFeeResult;
        }
        return (feeInBps, expiryBlockNumber);
    }

    function getStakerRewardPercentageInPrecision(address staker, uint epoch) public view returns(uint) {
        uint curEpoch = getCurrentEpochNumber();
        if (epoch >= curEpoch) { return 0; }

        uint numVotes = numberVotes[staker][epoch];
        // no votes, no rewards
        if (numVotes == 0) { return 0; }

        (uint stake, uint delegatedStake, address delegatedAddr) = staking.getStakerDataForPastEpoch(staker, epoch);
        uint totalStake = delegatedAddr == staker ? stake + delegatedStake : delegatedStake;
        if (totalStake == 0) { return 0; }

        uint points = numVotes * totalStake;
        uint totalPts = totalEpochPoints[epoch];
        if (totalPts == 0) { return 0; }

        return points * PRECISION / totalPts;
    }

    // return list campaign ids for epoch, excluding non-existed ones
    function getListCampIDs(uint epoch) public view returns(uint[] memory campIDs) {
        return epochCampaigns[epoch];
    }

    // Helper functions for squeezing data
    function getRebateAndRewardFromData(uint data)
        public pure
        returns(uint rebateInBps, uint rewardInBps)
    {
        rewardInBps = data & (POWER_128 - 1);
        rebateInBps = (data / POWER_128) & (POWER_128 - 1);
    }

    // revert here so if our operations use this func to generate data for new camp,
    // they can be aware when params are invalid
    function getDataFromRewardAndRebateWithValidation(uint rewardInBps, uint rebateInBps)
        public pure
        returns(uint data)
    {
        require(rewardInBps + rebateInBps <= BPS);
        data = rebateInBps * POWER_128 + rewardInBps;
    }

    // Note: option is indexed from 1
    function validateVoteOption(uint campID, uint option) internal view returns(bool) {
        // camp is not existed
        if (!isCampExisted[campID]) { return false; }
        Campaign storage camp = campaignData[campID];
        // campaign is not started or alr ended
        if (camp.startBlock > block.number || camp.endBlock < block.number) {
            return false;
        }
        // option is not in range
        if (camp.options.length <= option || option == 0) {
            return false;
        }
        return true;
    }

    function validateCampaignParams(
        CampaignType campType, uint startBlock, uint endBlock,
        uint currentEpoch, uint formulaParams, uint[] memory options
    ) 
        public view returns(bool)
    {
        // block number < start block < end block
        require(
            startBlock >= block.number,
            "validateCampaignParams: can not start in the past"
        );
        // camp duration must be at least min camp duration
        // endBlock - startBlock + 1 >= MIN_CAMP_DURATION,
        require(
            endBlock + 1 >= startBlock + MIN_CAMP_DURATION,
            "validateCampaignParams: camp duration is lower than min camp duration"
        );

        uint startEpoch = getEpochNumber(startBlock);
        uint endEpoch = getEpochNumber(endBlock);
        // start + end blocks must be in the same current epoch
        require(
            startEpoch == currentEpoch && endEpoch == currentEpoch,
            "validateCampaignParams: start and end block must be in current epoch"
        );

        // verify number of options
        uint numOptions = options.length;
        require(
            numOptions > 1 && numOptions <= MAX_CAMP_OPTIONS,
            "validateCampaignParams: number options is invalid"
        );

        // Validate option values based on campaign type
        if (campType == CampaignType.GENERAL) {
            // option must be positive number
            for(uint i = 0; i < options.length; i++) {
                require(
                    options[i] > 0,
                    "validateCampaignParams: general camp options must be positive"
                );
            }
        } else if (campType == CampaignType.NETWORK_FEE) {
            // network fee campaign, option must be fee in bps
            for(uint i = 0; i < options.length; i++) {
                // fee must <= 100%
                require(
                    options[i] <= BPS,
                    "validateCampaignParams: NetworkFee camp options must be smaller than or equal 100%"
                );
            }
        } else if (campType == CampaignType.FEE_HANDLER_BRR) {
            // brr fee handler campaign, option must be combined for reward + rebate %
            for(uint i = 0; i < options.length; i++) {
                // first 128 bits is rebate, last 128 bits is reward
                (uint rebateInBps, uint rewardInBps) = getRebateAndRewardFromData(options[i]);
                require(
                    rewardInBps + rebateInBps <= BPS,
                    "validateCampaignParams: BRR camp options must be smaller than or equal 100%"
                );
            }
        } else {
            require(false, "validateCampaignParams: invalid camp type");
        }

        FormulaData memory data = decodeFormulaParams(formulaParams);
        // percentage should be smaller than or equal 100%
        require(
            data.minPercentageInPrecision <= PRECISION,
            "validateCampaignParams: formula min percentage must not be greater than 100%"
        );

        return true;
    }

    function decodeWinningOptionData(uint data) internal pure returns(bool hasConcluded, uint optionID) {
        hasConcluded = ((data / POWER_128) & (POWER_128 - 1)) == 1;
        optionID = data & (POWER_128 - 1);
    }

    function encodeWinningOptionData(uint optionID, bool hasConcluded) internal pure returns(uint data) {
        data = optionID & (POWER_128 - 1);
        if (hasConcluded) {
            data += 1 * POWER_128;
        }
    }

    function decodeFormulaParams(uint data) internal pure returns(FormulaData memory formulaData) {
        formulaData.minPercentageInPrecision = data & (POWER_84 - 1);
        formulaData.cInPrecision = (data / POWER_84) & (POWER_84 - 1);
        formulaData.tInPrecision = (data / (POWER_84 * POWER_84)) & (POWER_84 - 1);
    }

    function encodeFormulaParams(
        uint minPercentageInPrecision, uint cInPrecision, uint tInPrecision
    ) public pure returns(uint data) {
        data = minPercentageInPrecision & (POWER_84 - 1);
        data |= (cInPrecision & (POWER_84 - 1)) * POWER_84;
        data |= (tInPrecision & (POWER_84 - 1)) * POWER_84 * POWER_84;
    }
}
