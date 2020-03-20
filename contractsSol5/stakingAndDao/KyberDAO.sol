pragma solidity 0.5.11;


import "./EpochUtils.sol";
import "../IERC20.sol";
import "./IKyberStaking.sol";
import "../IKyberDAO.sol";
import "../utils/zeppelin/ReentrancyGuard.sol";
import "../utils/Utils4.sol";


interface IFeeHandler {
    function claimStakerReward(address staker, uint percentageInBps, uint epoch) external returns(bool);
}

contract CampPermissionGroups {

    address public campaignCreator;
    address public pendingCampCreator;

    constructor(address _campCreator) public {
        require(_campCreator != address(0), "campCreator is 0");
        campaignCreator = _campCreator;
    }

    modifier onlyCampaignCreator() {
        require(msg.sender == campaignCreator, "only campaign creator");
        _;
    }

    event TransferCampaignCreatorPending(address pendingCampCreator);

    /**
     * @dev Allows the current campaignCreator to set the pendingCampCreator address.
     * @param newCampCreator The address to transfer ownership to.
     */
    function transferCampaignCreator(address newCampCreator) public onlyCampaignCreator {
        require(newCampCreator != address(0), "newCampCreator is 0");
        emit TransferCampaignCreatorPending(newCampCreator);
        pendingCampCreator = newCampCreator;
    }

    /**
     * @dev Allows the current campCcampaignCreatorreator to set the campaignCreator in one tx. Useful initial deployment.
     * @param newCampCreator The address to transfer ownership to.
     */
    function transferCampaignCreatorQuickly(address newCampCreator) public onlyCampaignCreator {
        require(newCampCreator != address(0), "newCampCreator is 0");
        emit TransferCampaignCreatorPending(newCampCreator);
        emit CampaignCreatorClaimed(newCampCreator, campaignCreator);
        campaignCreator = newCampCreator;
    }

    event CampaignCreatorClaimed(address newCampaignCreator, address previousCampaignCreator);

    /**
     * @dev Allows the pendingCampCreator address to finalize the change campaign creator process.
     */
    function claimCampaignCreator() public {
        require(pendingCampCreator == msg.sender, "only pending campaign creator");
        emit CampaignCreatorClaimed(pendingCampCreator, campaignCreator);
        campaignCreator = pendingCampCreator;
        pendingCampCreator = address(0);
    }
}

/**
* @dev camp -> campaign
* @dev Network fee campaign: options are fee in bps
* @dev BRR fee handler campaign: options are combined of rebate (left most 128 bits) + reward (right most 128 bits)
* @dev General campaign: options are from 1 to num_options
*/

/*
* This contract is using SafeMath for uint, which is inherited from EpochUtils
*/
contract KyberDAO is IKyberDAO, EpochUtils, ReentrancyGuard, CampPermissionGroups, Utils4 {
    // Constants
    uint internal constant POWER_128 = 2 ** 128;
    // max number of camps for each epoch
    uint public constant MAX_EPOCH_CAMPS = 10;
    // max number of options for each campaign
    uint public MAX_CAMP_OPTIONS = 8;
    // minimum blocks duration for a campaign
    uint public MIN_CAMP_DURATION_BLOCKS = 21600; // around 4 days

    IERC20 public kncToken;
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
        uint totalKNCSupply;        // total KNC supply at the time campaign was created
        FormulaData formulaData;    // formula params for concluding campaign result
        bytes link;                 // link to KIP, explaination of options, etc.
        uint[] options;             // data of options
    }

    /* Mapping from campaign ID => data */

    // use to generate increasing camp ID
    uint public numberCampaigns = 0;
    mapping(uint => bool) public campExists;
    mapping(uint => Campaign) internal campaignData;
    // campOptionVotes[campID]: total votes and vote of each option for a campaign
    // campOptionVotes[campID][0]: total votes, campOptionVotes[campID][1..]: vote for each option ID
    mapping(uint => uint[]) internal campOptionVotes;

    /** Mapping from epoch => data */

    // epochCampaigns[epoch]: list camp IDs for each epoch (epoch => camp IDs)
    mapping(uint => uint[]) internal epochCampaigns;
    // totalEpochPoints[epoch]: total points for an epoch (epoch => total points)
    mapping(uint => uint) internal totalEpochPoints;
    // numberVotes[staker][epoch]: number of campaigns that the staker has voted at an epoch
    mapping(address => mapping(uint => uint)) public numberVotes;
    // hasClaimedReward[staker][epoch]: true/false if the staker has/hasn't claimed the reward for an epoch
    mapping(address => mapping(uint => bool)) public hasClaimedReward;
    // stakerVotedOption[staker][campID]: staker's voted option ID for a campaign
    mapping(address => mapping(uint => uint)) public stakerVotedOption;

    /* Configuration Campaign Data */
    uint public latestNetworkFeeResult = 25; // 0.25%
    // epoch => campID for network fee campaign
    mapping(uint => uint) public networkFeeCamp;
    uint public latestBrrResult = 0; // 0: 0% reward + 0% rebate
    // epoch => campID for brr campaign
    mapping(uint => uint) public brrCampaign;

    constructor(
        uint _epochPeriod, uint _startBlock,
        address _staking, address _feeHandler, address _knc,
        uint _defaultNetworkFeeBps, uint _defaultRewardBps, uint _defaultRebateBps,
        address _campaignCreator
    ) public CampPermissionGroups(_campaignCreator) {
        require(_epochPeriod > 0, "ctor: epoch period is 0");
        require(_startBlock >= block.number, "ctor: start in the past");
        require(_staking != address(0), "ctor: staking is missing");
        require(_feeHandler != address(0), "ctor: feeHandler is missing");
        require(_knc != address(0), "ctor: knc token is missing");
        require(_defaultNetworkFeeBps <= BPS, "ctor: network fee high");

        staking = IKyberStaking(_staking);
        require(staking.EPOCH_PERIOD_BLOCKS() == _epochPeriod, "ctor: diff epoch period");
        require(staking.FIRST_EPOCH_START_BLOCK() == _startBlock, "ctor: diff start block");

        EPOCH_PERIOD_BLOCKS = _epochPeriod;
        FIRST_EPOCH_START_BLOCK = _startBlock;
        feeHandler = IFeeHandler(_feeHandler);
        kncToken = IERC20(_knc);
        latestNetworkFeeResult = _defaultNetworkFeeBps;
        // reward + rebate will be validated inside get func here
        latestBrrResult = getDataFromRewardAndRebateWithValidation(_defaultRewardBps, _defaultRebateBps);
    }

    modifier onlyStakingContract {
        require(msg.sender == address(staking), "only staking contract");
        _;
    }

    /**
    * @dev called by staking contract when staker wanted to withdraw
    * @param staker address of staker to reduce reward
    * @param reduceAmount amount voting power to be reduced for each campaign staker has voted at this epoch
    */
    function handleWithdrawal(address staker, uint reduceAmount) public onlyStakingContract returns(bool) {
        // staking shouldn't call this func with reduce amount = 0
        if (reduceAmount == 0) { return false; }
        uint curEpoch = getCurrentEpochNumber();

        // update total points for epoch
        uint numVotes = numberVotes[staker][curEpoch];
        // if no votes, no need to deduce points, but it should still return true to allow withdraw
        if (numVotes == 0) { return true; }

        totalEpochPoints[curEpoch] = totalEpochPoints[curEpoch].sub(numVotes.mul(reduceAmount));

        // update voted count for each camp staker has voted
        uint[] memory campIDs = epochCampaigns[curEpoch];

        for (uint i = 0; i < campIDs.length; i++) {
            uint campID = campIDs[i];
            uint votedOption = stakerVotedOption[staker][campID];
            // deduce vote count for current running campaign that this staker has voted
            if (votedOption > 0 && campaignData[campID].endBlock >= block.number) {
                // user already voted for this camp and the camp is not ended
                campOptionVotes[campID][0] = campOptionVotes[campID][0].sub(reduceAmount);
                campOptionVotes[campID][votedOption] = campOptionVotes[campID][votedOption].sub(reduceAmount);
            }
        }

        return true;
    }

    event NewCampaignCreated(
        CampaignType campType, uint campID,
        uint startBlock, uint endBlock,
        uint minPercentageInPrecision, uint cInPrecision, uint tInPrecision,
        uint[] options, bytes link
    );

    /**
    * @dev create new campaign, only called by admin
    * @param campType type of campaign (network fee, brr, general)
    * @param startBlock block to start running the campaign
    * @param endBlock block to end this campaign
    * @param minPercentageInPrecision min percentage (in precision) for formula to conclude campaign
    * @param cInPrecision c value (in precision) for formula to conclude campaign
    * @param tInPrecision t value (in precision) for formula to conclude campaign
    * @param options list values of options to vote for this campaign
    * @param link additional data for this campaign
    */
    function submitNewCampaign(
        CampaignType campType, uint startBlock, uint endBlock,
        uint minPercentageInPrecision, uint cInPrecision, uint tInPrecision,
        uint[] memory options, bytes memory link
    )
        public onlyCampaignCreator returns(uint campID)
    {
        // campaign epoch could be different from current epoch
        // as we allow to create campaign of next epoch as well
        uint campEpoch = getEpochNumber(startBlock);

        require(
            epochCampaigns[campEpoch].length < MAX_EPOCH_CAMPS,
            "newCampaign: too many campaigns"
        );

        require(
            validateCampaignParams(
                campType, startBlock, endBlock, campEpoch,
                minPercentageInPrecision, cInPrecision, tInPrecision, options),
            "newCampaign: invalid campaign params"
        );

        if (campType == CampaignType.NETWORK_FEE) {
            require(networkFeeCamp[campEpoch] == 0, "newCampaign: alr had network fee for this epoch");
        } else if (campType == CampaignType.FEE_HANDLER_BRR) {
            require(brrCampaign[campEpoch] == 0, "newCampaign: alr had brr for this epoch");
        }

        numberCampaigns = numberCampaigns.add(1);
        campID = numberCampaigns;

        campExists[campID] = true;
        // add campID into this current epoch camp IDs
        epochCampaigns[campEpoch].push(campID);
        // update network fee or brr campaigns
        if (campType == CampaignType.NETWORK_FEE) {
            networkFeeCamp[campEpoch] = campID;
        } else if (campType == CampaignType.FEE_HANDLER_BRR) {
            brrCampaign[campEpoch] = campID;
        }

        FormulaData memory formulaData = FormulaData({
            minPercentageInPrecision: minPercentageInPrecision,
            cInPrecision: cInPrecision,
            tInPrecision: tInPrecision
        });

        campaignData[campID] = Campaign({
            campID: campID,
            campType: campType,
            startBlock: startBlock,
            endBlock: endBlock,
            totalKNCSupply: kncToken.totalSupply(),
            link: link,
            formulaData: formulaData,
            options: options
        });

        // index 0 for total votes, index 1 -> options.length for each option
        campOptionVotes[campID] = new uint[](options.length + 1);

        emit NewCampaignCreated(
            campType, campID, startBlock, endBlock,
            minPercentageInPrecision, cInPrecision, tInPrecision,
            options, link
        );
    }

    event CancelledCampaign(uint campID);

    /**
    * @dev cancel a campaign with given id, called by admin only
    * @dev only can cancel campaigns that have not started yet
    * @param campID id of the campaign to cancel
    */
    function cancelCampaign(uint campID) public onlyCampaignCreator {
        require(campExists[campID], "cancelCampaign: campID doesn't exist");

        Campaign storage camp = campaignData[campID];

        require(camp.startBlock > block.number, "cancelCampaign: campaign alr started");

        uint epoch = getEpochNumber(camp.startBlock);

        campExists[campID] = false;

        if (camp.campType == CampaignType.NETWORK_FEE) {
            delete networkFeeCamp[epoch];
        } else if (camp.campType == CampaignType.FEE_HANDLER_BRR) {
            delete brrCampaign[epoch];
        }

        delete campaignData[campID];
        delete campOptionVotes[campID];

        uint[] storage campIDs = epochCampaigns[epoch];
        for (uint i = 0; i < campIDs.length; i++) {
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

    /**
    * @dev vote for an option of a campaign
    * @dev options are indexed from 1 to number of options
    * @param campID id of campaign to vote for
    * @param option id of options to vote for
    */
    function vote(uint campID, uint option) public returns(bool) {
        require(validateVoteOption(campID, option), "vote: invalid campID or option");
        address staker = msg.sender;

        uint curEpoch = getCurrentEpochNumber();
        (uint stake, uint dStake, address dAddress) = staking.initAndReturnStakerDataForCurrentEpoch(staker);

        uint totalStake = dAddress == staker ? stake.add(dStake) : dStake;
        uint lastVotedOption = stakerVotedOption[staker][campID];

        if (lastVotedOption == 0) {
            // increase number campaigns that the staker has voted for first time voted
            numberVotes[staker][curEpoch]++;

            totalEpochPoints[curEpoch] = totalEpochPoints[curEpoch].add(totalStake);
            // increase voted points for this option
            campOptionVotes[campID][option] = campOptionVotes[campID][option].add(totalStake);
            // increase total votes
            campOptionVotes[campID][0] = campOptionVotes[campID][0].add(totalStake);
        } else if (lastVotedOption != option) {
            // deduce previous option voted count
            campOptionVotes[campID][lastVotedOption] = campOptionVotes[campID][lastVotedOption].sub(totalStake);
            // increase new option voted count
            campOptionVotes[campID][option] = campOptionVotes[campID][option].add(totalStake);
        }

        stakerVotedOption[staker][campID] = option;

        emit Voted(staker, curEpoch, campID, option);
    }

    event RewardClaimed(address staker, uint epoch, uint perInPrecision);

    /**
    * @dev call to claim reward of an epoch, can call by anyone, only once for each epoch
    * @param staker address to claim reward for
    * @param epoch to claim reward
    */
    function claimReward(address staker, uint epoch) public nonReentrant {
        uint curEpoch = getCurrentEpochNumber();
        require(epoch < curEpoch, "claimReward: only for past epochs");
        require(!hasClaimedReward[staker][epoch], "claimReward: alr claimed");

        uint perInPrecision = getStakerRewardPercentageInPrecision(staker, epoch);
        require(perInPrecision > 0, "claimReward: No reward");

        hasClaimedReward[staker][epoch] = true;
        // call fee handler to claim reward
        require(feeHandler.claimStakerReward(staker, perInPrecision, epoch), "claimReward: feeHandle failed to claim");

        emit RewardClaimed(staker, epoch, perInPrecision);
    }

    /**
    * @dev get latest network fee data + expiry block number
    * @dev conclude network fee campaign if needed and caching latest result in DAO
    */
    function getLatestNetworkFeeDataWithCache() public returns(uint feeInBps, uint expiryBlockNumber) {
        uint curEpoch = getCurrentEpochNumber();

        feeInBps = latestNetworkFeeResult;
        // expiryBlockNumber = FIRST_EPOCH_START_BLOCK + curEpoch * EPOCH_PERIOD_BLOCKS - 1;
        expiryBlockNumber = FIRST_EPOCH_START_BLOCK.add(curEpoch.mul(EPOCH_PERIOD_BLOCKS)).sub(1);

        // there is no camp for epoch 0
        if (curEpoch == 0) {
            return (feeInBps, expiryBlockNumber);
        }

        uint campID = networkFeeCamp[curEpoch.sub(1)];
        if (campID == 0) {
            // don't have network fee campaign, return latest result
            return (feeInBps, expiryBlockNumber);
        }

        uint winningOption;
        (winningOption, feeInBps) = getCampaignWinningOptionAndValue(campID);

        if (winningOption == 0) {
            // no winning option, fall back to previous result
            feeInBps = latestNetworkFeeResult;
        } else {
            // update latest result based on new winning option
            latestNetworkFeeResult = feeInBps;
        }
    }

    /**
    * @dev return latest burn/reward/rebate data, also affecting epoch + expiry block number
    * @dev conclude brr campaign if needed and caching latest result in DAO
    */
    function getLatestBRRData()
        public
        returns(uint burnInBps, uint rewardInBps, uint rebateInBps, uint epoch, uint expiryBlockNumber)
    {
        epoch = getCurrentEpochNumber();
        // expiryBlockNumber = FIRST_EPOCH_START_BLOCK + curEpoch * EPOCH_PERIOD_BLOCKS - 1;
        expiryBlockNumber = FIRST_EPOCH_START_BLOCK.add(epoch.mul(EPOCH_PERIOD_BLOCKS)).sub(1);
        uint brrData = latestBrrResult;
        if (epoch > 0) {
            uint campID = brrCampaign[epoch.sub(1)];
            if (campID != 0) {
                uint winningOption;
                (winningOption, brrData) = getCampaignWinningOptionAndValue(campID);
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
        burnInBps = BPS.sub(rebateInBps).sub(rewardInBps);
    }

    /**
    * @dev some epochs have reward but no one can claim, for example: epoch 0
    * @dev return true if should burn all that reward
    * @param epoch epoch to check for burning reward
    */
    function shouldBurnRewardForEpoch(uint epoch) public view returns(bool) {
        uint curEpoch = getCurrentEpochNumber();
        if (epoch >= curEpoch) { return false; }
        return totalEpochPoints[epoch] == 0;
    }

    function getCampaignDetails(uint campID)
        public view
        returns(
            CampaignType campType, uint startBlock, uint endBlock, uint totalKNCSupply,
            uint minPercentageInPrecision, uint cInPrecision, uint tInPrecision,
            bytes memory link, uint[] memory options
        )
    {
        Campaign storage camp = campaignData[campID];
        campType = camp.campType;
        startBlock = camp.startBlock;
        endBlock = camp.endBlock;
        totalKNCSupply = camp.totalKNCSupply;
        minPercentageInPrecision = camp.formulaData.minPercentageInPrecision;
        cInPrecision = camp.formulaData.cInPrecision;
        tInPrecision = camp.formulaData.tInPrecision;
        link = camp.link;
        options = camp.options;
    }

    function getCampaignVoteCountData(uint campID) public view returns(uint[] memory voteCounts, uint totalVoteCount) {
        uint[] memory votes = campOptionVotes[campID];
        if (votes.length == 0) {
            return (voteCounts, totalVoteCount);
        }
        totalVoteCount = votes[0];
        voteCounts = new uint[](votes.length - 1);
        for (uint i = 0; i < voteCounts.length; i++) {
            voteCounts[i] = votes[i + 1];
        }
    }

    /**
    * @dev return campaign winning option and its value
    * @dev return (0, 0) if campaign does not existed
    * @dev return (0, 0) if campaign is not ended yet
    * @dev return (0, 0) if campaign has no winning option based on the formula
    * @param campID id of campaign to get result
    */
    function getCampaignWinningOptionAndValue(uint campID)
        public view
        returns(uint optionID, uint value)
    {
        if (!campExists[campID]) { return (0, 0); } // not exist

        Campaign storage camp = campaignData[campID];

        // not found or not ended yet, return 0 as winning option
        if (camp.endBlock == 0 || camp.endBlock > block.number) { return (0, 0); }

        uint totalSupply = camp.totalKNCSupply;
        // something is wrong here, total KNC supply shouldn't be 0
        if (totalSupply == 0) { return (0, 0); }

        uint[] memory voteCounts = campOptionVotes[campID];

        // Finding option with most votes
        uint winningOption = 0;
        uint maxVotedCount = 0;
        for (uint i = 1; i < voteCounts.length; i++) {
            if (voteCounts[i] > maxVotedCount) {
                winningOption = i;
                maxVotedCount = voteCounts[i];
            } else if (voteCounts[i] == maxVotedCount) {
                winningOption = 0;
            }
        }
        // more than 1 options have same vote count
        if (winningOption == 0) { return (0, 0); }

        FormulaData memory formulaData = camp.formulaData;

        uint totalVotes = voteCounts[0];
        // compute voted percentage (in precision)
        uint votedPercentage = totalVotes.mul(PRECISION).div(camp.totalKNCSupply);

        // total voted percentage is below min acceptable percentage, no winning option
        if (formulaData.minPercentageInPrecision > votedPercentage) { return (0, 0); }

        // as we already limit value for c & t, no need to check for overflow here
        uint x = formulaData.tInPrecision.mul(votedPercentage).div(PRECISION);
        if (x <= formulaData.cInPrecision) {
            // threshold is not negative, need to compare with voted count
            uint y = formulaData.cInPrecision.sub(x);
            // (most voted option count / total votes) is below threshold, no winining option
            if (maxVotedCount.mul(PRECISION) < y.mul(totalVotes)) { return (0, 0); }
        }

        optionID = winningOption;
        value = camp.options[optionID - 1];
    }

    /**
    * @dev return latest network fee with expiry block number
    */
    function getLatestNetworkFeeData() public view returns(uint feeInBps, uint expiryBlockNumber) {
        uint curEpoch = getCurrentEpochNumber();
        feeInBps = latestNetworkFeeResult;
        // expiryBlockNumber = FIRST_EPOCH_START_BLOCK + curEpoch * EPOCH_PERIOD_BLOCKS - 1;
        expiryBlockNumber = FIRST_EPOCH_START_BLOCK.add(curEpoch.mul(EPOCH_PERIOD_BLOCKS)).sub(1);
        if (curEpoch == 0) {
            return (feeInBps, expiryBlockNumber);
        }
        uint campID = networkFeeCamp[curEpoch.sub(1)];
        if (campID == 0) {
            // don't have network fee campaign, return latest result
            return (feeInBps, expiryBlockNumber);
        }

        uint winningOption;
        (winningOption, feeInBps) = getCampaignWinningOptionAndValue(campID);
        if (winningOption == 0) {
            feeInBps = latestNetworkFeeResult;
        }
        return (feeInBps, expiryBlockNumber);
    }

    /**
    * @dev return staker's reward percentage in precision for an epoch
    * @dev return 0 if epoch is in the future
    * @dev return 0 if staker has no votes or stakes
    */
    function getStakerRewardPercentageInPrecision(address staker, uint epoch) public view returns(uint) {
        uint curEpoch = getCurrentEpochNumber();
        if (epoch > curEpoch) { return 0; }

        uint numVotes = numberVotes[staker][epoch];
        // no votes, no rewards
        if (numVotes == 0) { return 0; }

        (uint stake, uint delegatedStake, address delegatedAddr) = staking.getStakerDataForPastEpoch(staker, epoch);
        uint totalStake = delegatedAddr == staker ? stake.add(delegatedStake) : delegatedStake;
        if (totalStake == 0) { return 0; }

        uint points = numVotes.mul(totalStake);
        uint totalPts = totalEpochPoints[epoch];
        if (totalPts == 0) { return 0; }
        // something is wrong here, points should never be greater than total pts
        if (points > totalPts) { return 0; }

        return points.mul(PRECISION).div(totalPts);
    }

    // return list campaign ids for epoch, excluding non-existed ones
    function getListCampIDs(uint epoch) public view returns(uint[] memory campIDs) {
        return epochCampaigns[epoch];
    }

    /** 
    * @dev return latest brr data after decoded so it is easily to check from read contract
    */
    function latestBRRDataDecoded()
        public view
        returns(uint burnInBps, uint rewardInBps, uint rebateInBps, uint epoch, uint expiryBlockNumber)
    {
        epoch = getCurrentEpochNumber();
        // expiryBlockNumber = FIRST_EPOCH_START_BLOCK + curEpoch * EPOCH_PERIOD_BLOCKS - 1;
        expiryBlockNumber = FIRST_EPOCH_START_BLOCK.add(epoch.mul(EPOCH_PERIOD_BLOCKS)).sub(1);
        uint brrData = latestBrrResult;
        if (epoch > 0) {
            uint campID = brrCampaign[epoch.sub(1)];
            if (campID != 0) {
                uint winningOption;
                (winningOption, brrData) = getCampaignWinningOptionAndValue(campID);
                if (winningOption == 0) {
                    // no winning option, fallback to previous result
                    brrData = latestBrrResult;
                }
            }
        }

        (rebateInBps, rewardInBps) = getRebateAndRewardFromData(brrData);
        burnInBps = BPS.sub(rebateInBps).sub(rewardInBps);
    }

    // Helper functions for squeezing data
    function getRebateAndRewardFromData(uint data)
        public pure
        returns(uint rebateInBps, uint rewardInBps)
    {
        rewardInBps = data & (POWER_128.sub(1));
        rebateInBps = (data.div(POWER_128)) & (POWER_128.sub(1));
    }

    /**
    * @dev helper func to get encoded reward and rebate
    * @dev revert if validation failed
    */
    function getDataFromRewardAndRebateWithValidation(uint rewardInBps, uint rebateInBps)
        public pure
        returns(uint data)
    {
        require(rewardInBps.add(rebateInBps) <= BPS, "reward plus rebate high");
        data = (rebateInBps.mul(POWER_128)).add(rewardInBps);
    }

    /**
    * Validate params to check if we could submit a new campaign with these params
    */
    function validateCampaignParams(
        CampaignType campType, uint startBlock, uint endBlock, uint startEpoch,
        uint minPercentageInPrecision, uint cInPrecision, uint tInPrecision,
        uint[] memory options
    )
        public view returns(bool)
    {
        // block number <= start block < end block
        require(
            startBlock >= block.number,
            "validateParams: can't start in the past"
        );
        // camp duration must be at least min camp duration
        // endBlock - startBlock + 1 >= MIN_CAMP_DURATION_BLOCKS,
        require(
            endBlock.add(1) >= startBlock.add(MIN_CAMP_DURATION_BLOCKS),
            "validateParams: campaign duration is low"
        );

        uint currentEpoch = getCurrentEpochNumber();
        uint endEpoch = getEpochNumber(endBlock);
        // start + end blocks must be in the same epoch
        require(
            startEpoch == endEpoch,
            "validateParams: start & end not same epoch"
        );
        // start + end blocks must be in the same epoch
        require(
            startEpoch <= currentEpoch + 1,
            "validateParams: only for current or next epochs"
        );

        // verify number of options
        uint numOptions = options.length;
        require(
            numOptions > 1 && numOptions <= MAX_CAMP_OPTIONS,
            "validateParams: invalid number of options"
        );

        // Validate option values based on campaign type
        if (campType == CampaignType.GENERAL) {
            // option must be positive number
            for (uint i = 0; i < options.length; i++) {
                require(
                    options[i] > 0,
                    "validateParams: general campaign option is 0"
                );
            }
        } else if (campType == CampaignType.NETWORK_FEE) {
            // network fee campaign, option must be fee in bps
            for (uint i = 0; i < options.length; i++) {
                // fee must <= 100%
                require(
                    options[i] <= BPS,
                    "validateParams: Fee campaign option value is too high"
                );
            }
        } else {
            // brr fee handler campaign, option must be combined for reward + rebate %
            for (uint i = 0; i < options.length; i++) {
                // first 128 bits is rebate, last 128 bits is reward
                (uint rebateInBps, uint rewardInBps) = getRebateAndRewardFromData(options[i]);
                require(
                    rewardInBps + rebateInBps <= BPS,
                    "validateParams: RR values are too high"
                );
            }
        }

        // percentage should be smaller than or equal 100%
        require(
            minPercentageInPrecision <= PRECISION,
            "validateParams: min percentage is high"
        );

        // limit value of c and t to avoid overflow
        require(
            cInPrecision <= POWER_128,
            "validateParams: c is high"
        );

        require(
            tInPrecision <= POWER_128,
            "validateParams: t is high"
        );

        return true;
    }

    /**
    * @dev options are indexed from 1
    */
    function validateVoteOption(uint campID, uint option) internal view returns(bool) {
        require(campExists[campID], "vote: campaign doesn't exist");

        Campaign storage camp = campaignData[campID];

        require(camp.startBlock <= block.number, "vote: campaign not started");
        require(camp.endBlock >= block.number, "vote: campaign alr ended");

        require(option > 0, "vote: option is 0");
        require(option <= camp.options.length, "vote: option is not in range");

        return true;
    }
}
