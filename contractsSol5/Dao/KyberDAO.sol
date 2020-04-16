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
    address public pendingCampaignCreator;

    constructor(address _campaignCreator) public {
        require(_campaignCreator != address(0), "campaignCreator is 0");
        campaignCreator = _campaignCreator;
    }

    modifier onlyCampaignCreator() {
        require(msg.sender == campaignCreator, "only campaign creator");
        _;
    }

    event TransferCampaignCreatorPending(address pendingCampaignCreator);

    /**
     * @dev Allows the current campaignCreator to set the pendingCampaignCreator address.
     * @param newCampaignCreator The address to transfer ownership to.
     */
    function transferCampaignCreator(address newCampaignCreator) public onlyCampaignCreator {
        require(newCampaignCreator != address(0), "newCampaignCreator is 0");
        emit TransferCampaignCreatorPending(newCampaignCreator);
        pendingCampaignCreator = newCampaignCreator;
    }

    /**
     * @dev Allows the current campCcampaignCreatorreator to set the campaignCreator in one tx. Useful initial deployment.
     * @param newCampaignCreator The address to transfer ownership to.
     */
    function transferCampaignCreatorQuickly(address newCampaignCreator) public onlyCampaignCreator {
        require(newCampaignCreator != address(0), "newCampaignCreator is 0");
        emit TransferCampaignCreatorPending(newCampaignCreator);
        emit CampaignCreatorClaimed(newCampaignCreator, campaignCreator);
        campaignCreator = newCampaignCreator;
    }

    event CampaignCreatorClaimed(address newCampaignCreator, address previousCampaignCreator);

    /**
     * @dev Allows the pendingCampaignCreator address to finalize the change campaign creator process.
     */
    function claimCampaignCreator() public {
        require(pendingCampaignCreator == msg.sender, "only pending campaign creator");
        emit CampaignCreatorClaimed(pendingCampaignCreator, campaignCreator);
        campaignCreator = pendingCampaignCreator;
        pendingCampaignCreator = address(0);
    }
}

/**
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
    // max number of campaigns for each epoch
    uint public constant MAX_EPOCH_CAMPAIGNS = 10;
    // max number of options for each campaign
    uint public constant MAX_CAMPAIGN_OPTIONS = 8;
    // minimum duration in seconds for a campaign
    uint public minCampaignDurationInSeconds = 345600; // around 4 days

    IERC20 public kncToken;
    IKyberStaking public staking;
    IFeeHandler public feeHandler;

    enum CampaignType { General, NetworkFee, FeeHandlerBRR }

    struct FormulaData {
        uint minPercentageInPrecision;
        uint cInPrecision;
        uint tInPrecision;
    }

    struct CampaignVoteData {
        uint totalVotes;
        uint[] votePerOption;
    }

    struct Campaign {
        CampaignType campaignType;
        bool campaignExists;
        uint startTimestamp;
        uint endTimestamp;
        uint totalKNCSupply;                // total KNC supply at the time campaign was created
        FormulaData formulaData;            // formula params for concluding campaign result
        bytes link;                         // link to KIP, explaination of options, etc.
        uint[] options;                     // data of options
        CampaignVoteData campaignVoteData;  // campaign vote data: total votes + vote per option
    }

    struct BRRData {
        uint rewardInBps;
        uint rebateInBps;
    }

    /* Mapping from campaign ID => data */

    // use to generate increasing campaign ID
    uint public numberCampaigns = 0;
    mapping(uint => Campaign) internal campaignData;
    /** Mapping from epoch => data */

    // epochCampaigns[epoch]: list campaign IDs for each epoch (epoch => campaign IDs)
    mapping(uint => uint[]) internal epochCampaigns;
    // totalEpochPoints[epoch]: total points for an epoch (epoch => total points)
    mapping(uint => uint) internal totalEpochPoints;
    // numberVotes[staker][epoch]: number of campaigns that the staker has voted at an epoch
    mapping(address => mapping(uint => uint)) public numberVotes;
    // hasClaimedReward[staker][epoch]: true/false if the staker has/hasn't claimed the reward for an epoch
    mapping(address => mapping(uint => bool)) public hasClaimedReward;
    // stakerVotedOption[staker][campaignID]: staker's voted option ID for a campaign
    mapping(address => mapping(uint => uint)) public stakerVotedOption;

    /* Configuration Campaign Data */
    uint internal latestNetworkFeeResult = 25; // 0.25%
    // epoch => campaignID for network fee campaigns
    mapping(uint => uint) public networkFeeCampaigns;
    // latest BRR data (reward and rebate in bps)
    BRRData internal latestBrrData;
    // epoch => campaignID for brr campaigns
    mapping(uint => uint) public brrCampaigns;

    constructor(
        uint _epochPeriod, uint _startTimestamp,
        address _staking, address _feeHandler, address _knc,
        uint _defaultNetworkFeeBps, uint _defaultRewardBps, uint _defaultRebateBps,
        address _campaignCreator
    ) public CampPermissionGroups(_campaignCreator) {
        require(_epochPeriod > 0, "ctor: epoch period is 0");
        require(_startTimestamp >= now, "ctor: start in the past");
        require(_staking != address(0), "ctor: staking is missing");
        require(_feeHandler != address(0), "ctor: feeHandler is missing");
        require(_knc != address(0), "ctor: knc token is missing");
        // in Network, maximum fee that can be taken from 1 tx is (platform fee + 2 * network fee)
        // so network fee should be less than 50%
        require(_defaultNetworkFeeBps < BPS / 2, "ctor: network fee high");
        require(_defaultRewardBps.add(_defaultRebateBps) <= BPS, "reward plus rebate high");

        staking = IKyberStaking(_staking);
        require(staking.epochPeriodInSeconds() == _epochPeriod, "ctor: diff epoch period");
        require(staking.firstEpochStartTimestamp() == _startTimestamp, "ctor: diff start timestamp");

        epochPeriodInSeconds = _epochPeriod;
        firstEpochStartTimestamp = _startTimestamp;
        feeHandler = IFeeHandler(_feeHandler);
        kncToken = IERC20(_knc);
        latestNetworkFeeResult = _defaultNetworkFeeBps;
        // reward + rebate will be validated inside get func here
        latestBrrData.rewardInBps = _defaultRewardBps;
        latestBrrData.rebateInBps = _defaultRebateBps;
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
    function handleWithdrawal(address staker, uint reduceAmount) external onlyStakingContract returns(bool) {
        // staking shouldn't call this func with reduce amount = 0
        if (reduceAmount == 0) { return false; }
        uint curEpoch = getCurrentEpochNumber();

        // update total points for epoch
        uint numVotes = numberVotes[staker][curEpoch];
        // if no votes, no need to deduce points, but it should still return true to allow withdraw
        if (numVotes == 0) { return true; }

        totalEpochPoints[curEpoch] = totalEpochPoints[curEpoch].sub(numVotes.mul(reduceAmount));

        // update voted count for each campaign staker has voted
        uint[] memory campaignIDs = epochCampaigns[curEpoch];

        for (uint i = 0; i < campaignIDs.length; i++) {
            uint campaignID = campaignIDs[i];

            uint votedOption = stakerVotedOption[staker][campaignID];
            if (votedOption == 0) { continue; } // staker has not voted yet

            Campaign storage campaign = campaignData[campaignID];
            // deduce vote count for current running campaign that this staker has voted
            if (campaign.endTimestamp >= now) {
                // user already voted for this campaign and the campaign is not ended
                campaign.campaignVoteData.totalVotes = campaign.campaignVoteData.totalVotes.sub(reduceAmount);
                campaign.campaignVoteData.votePerOption[votedOption - 1] = campaign.campaignVoteData.votePerOption[votedOption - 1].sub(reduceAmount);
            }
        }

        return true;
    }

    event NewCampaignCreated(
        CampaignType campaignType, uint campaignID,
        uint startTimestamp, uint endTimestamp,
        uint minPercentageInPrecision, uint cInPrecision, uint tInPrecision,
        uint[] options, bytes link
    );

    /**
    * @dev create new campaign, only called by admin
    * @param campaignType type of campaign (network fee, brr, general)
    * @param startTimestamp timestamp to start running the campaign
    * @param endTimestamp timestamp to end this campaign
    * @param minPercentageInPrecision min percentage (in precision) for formula to conclude campaign
    * @param cInPrecision c value (in precision) for formula to conclude campaign
    * @param tInPrecision t value (in precision) for formula to conclude campaign
    * @param options list values of options to vote for this campaign
    * @param link additional data for this campaign
    */
    function submitNewCampaign(
        CampaignType campaignType, uint startTimestamp, uint endTimestamp,
        uint minPercentageInPrecision, uint cInPrecision, uint tInPrecision,
        uint[] calldata options, bytes calldata link
    )
        external onlyCampaignCreator returns(uint campaignID)
    {
        // campaign epoch could be different from current epoch
        // as we allow to create campaign of next epoch as well
        uint campEpoch = getEpochNumber(startTimestamp);

        require(
            epochCampaigns[campEpoch].length < MAX_EPOCH_CAMPAIGNS,
            "newCampaign: too many campaigns"
        );

        require(
            validateCampaignParams(
                campaignType, startTimestamp, endTimestamp, campEpoch,
                minPercentageInPrecision, cInPrecision, tInPrecision, options),
            "newCampaign: invalid campaign params"
        );

        if (campaignType == CampaignType.NetworkFee) {
            require(networkFeeCampaigns[campEpoch] == 0, "newCampaign: already had network fee for this epoch");
        } else if (campaignType == CampaignType.FeeHandlerBRR) {
            require(brrCampaigns[campEpoch] == 0, "newCampaign: already had brr for this epoch");
        }

        numberCampaigns = numberCampaigns.add(1);
        campaignID = numberCampaigns;

        // add campaignID into this current epoch campaign IDs
        epochCampaigns[campEpoch].push(campaignID);
        // update network fee or brr campaigns
        if (campaignType == CampaignType.NetworkFee) {
            networkFeeCampaigns[campEpoch] = campaignID;
        } else if (campaignType == CampaignType.FeeHandlerBRR) {
            brrCampaigns[campEpoch] = campaignID;
        }

        FormulaData memory formulaData = FormulaData({
            minPercentageInPrecision: minPercentageInPrecision,
            cInPrecision: cInPrecision,
            tInPrecision: tInPrecision
        });
        CampaignVoteData memory campaignVoteData = CampaignVoteData({
            totalVotes: 0,
            votePerOption: new uint[](options.length)
        });

        campaignData[campaignID] = Campaign({
            campaignExists: true,
            campaignType: campaignType,
            startTimestamp: startTimestamp,
            endTimestamp: endTimestamp,
            totalKNCSupply: kncToken.totalSupply(),
            link: link,
            formulaData: formulaData,
            options: options,
            campaignVoteData: campaignVoteData
        });

        emit NewCampaignCreated(
            campaignType, campaignID, startTimestamp, endTimestamp,
            minPercentageInPrecision, cInPrecision, tInPrecision,
            options, link
        );
    }

    event CancelledCampaign(uint campaignID);

    /**
    * @dev  cancel a campaign with given id, called by admin only
    *       only can cancel campaigns that have not started yet
    * @param campaignID id of the campaign to cancel
    */
    function cancelCampaign(uint campaignID) external onlyCampaignCreator {
        Campaign storage campaign = campaignData[campaignID];
        require(campaign.campaignExists, "cancelCampaign: campaignID doesn't exist");

        require(campaign.startTimestamp > now, "cancelCampaign: campaign already started");

        uint epoch = getEpochNumber(campaign.startTimestamp);

        if (campaign.campaignType == CampaignType.NetworkFee) {
            delete networkFeeCampaigns[epoch];
        } else if (campaign.campaignType == CampaignType.FeeHandlerBRR) {
            delete brrCampaigns[epoch];
        }

        delete campaignData[campaignID];

        uint[] storage campaignIDs = epochCampaigns[epoch];
        for (uint i = 0; i < campaignIDs.length; i++) {
            if (campaignIDs[i] == campaignID) {
                // remove this campaign id out of list
                campaignIDs[i] = campaignIDs[campaignIDs.length - 1];
                delete campaignIDs[campaignIDs.length - 1];
                campaignIDs.pop();
                break;
            }
        }

        emit CancelledCampaign(campaignID);
    }

    event Voted(address staker, uint epoch, uint campaignID, uint option);

    /**
    * @dev  vote for an option of a campaign
    *       options are indexed from 1 to number of options
    * @param campaignID id of campaign to vote for
    * @param option id of options to vote for
    */
    function vote(uint campaignID, uint option) external {
        require(validateVoteOption(campaignID, option), "vote: invalid campaignID or option");
        address staker = msg.sender;

        uint curEpoch = getCurrentEpochNumber();
        (uint stake, uint dStake, address dAddress) = staking.initAndReturnStakerDataForCurrentEpoch(staker);

        uint totalStake = dAddress == staker ? stake.add(dStake) : dStake;
        uint lastVotedOption = stakerVotedOption[staker][campaignID];

        CampaignVoteData storage voteData = campaignData[campaignID].campaignVoteData;

        if (lastVotedOption == 0) {
            // increase number campaigns that the staker has voted for first time voted
            numberVotes[staker][curEpoch]++;

            totalEpochPoints[curEpoch] = totalEpochPoints[curEpoch].add(totalStake);
            // increase voted points for this option
            voteData.votePerOption[option - 1] = voteData.votePerOption[option - 1].add(totalStake);
            // increase total votes
            voteData.totalVotes = voteData.totalVotes.add(totalStake);
        } else if (lastVotedOption != option) {
            // deduce previous option voted count
            voteData.votePerOption[lastVotedOption - 1] = voteData.votePerOption[lastVotedOption - 1].sub(totalStake);
            // increase new option voted count
            voteData.votePerOption[option - 1] = voteData.votePerOption[option - 1].add(totalStake);
        }

        stakerVotedOption[staker][campaignID] = option;

        emit Voted(staker, curEpoch, campaignID, option);
    }

    event RewardClaimed(address staker, uint epoch, uint perInPrecision);

    /**
    * @dev call to claim reward of an epoch, can call by anyone, only once for each epoch
    * @param staker address to claim reward for
    * @param epoch to claim reward
    */
    function claimReward(address staker, uint epoch) external nonReentrant {
        uint curEpoch = getCurrentEpochNumber();
        require(epoch < curEpoch, "claimReward: only for past epochs");
        require(!hasClaimedReward[staker][epoch], "claimReward: already claimed");

        uint perInPrecision = getStakerRewardPercentageInPrecision(staker, epoch);
        require(perInPrecision > 0, "claimReward: No reward");

        hasClaimedReward[staker][epoch] = true;
        // call fee handler to claim reward
        require(feeHandler.claimStakerReward(staker, perInPrecision, epoch), "claimReward: feeHandle failed to claim");

        emit RewardClaimed(staker, epoch, perInPrecision);
    }

    /**
    * @dev get latest network fee data + expiry timestamp
    *    conclude network fee campaign if needed and caching latest result in DAO
    */
    function getLatestNetworkFeeDataWithCache() public returns(uint feeInBps, uint expiryTimestamp) {
        (feeInBps, expiryTimestamp) = getLatestNetworkFeeData();
        // cache latest data
        latestNetworkFeeResult = feeInBps;
    }

    /**
    * @dev return latest burn/reward/rebate data, also affecting epoch + expiry timestamp
    *      conclude brr campaign if needed and caching latest result in DAO
    */
    function getLatestBRRDataWithCache()
        public
        returns(uint burnInBps, uint rewardInBps, uint rebateInBps, uint epoch, uint expiryTimestamp)
    {
        (burnInBps, rewardInBps, rebateInBps, epoch, expiryTimestamp) = getLatestBRRDataDecoded();
        latestBrrData.rewardInBps = rewardInBps;
        latestBrrData.rebateInBps = rebateInBps;
    }

    /**
    * @dev some epochs have reward but no one can claim, for example: epoch 0
    *      return true if should burn all that reward
    * @param epoch epoch to check for burning reward
    */
    function shouldBurnRewardForEpoch(uint epoch) external view returns(bool) {
        uint curEpoch = getCurrentEpochNumber();
        if (epoch >= curEpoch) { return false; }
        return totalEpochPoints[epoch] == 0;
    }

    function getCampaignDetails(uint campaignID)
        external view
        returns(
            CampaignType campaignType, uint startTimestamp, uint endTimestamp, uint totalKNCSupply,
            uint minPercentageInPrecision, uint cInPrecision, uint tInPrecision,
            bytes memory link, uint[] memory options
        )
    {
        Campaign storage campaign = campaignData[campaignID];
        campaignType = campaign.campaignType;
        startTimestamp = campaign.startTimestamp;
        endTimestamp = campaign.endTimestamp;
        totalKNCSupply = campaign.totalKNCSupply;
        minPercentageInPrecision = campaign.formulaData.minPercentageInPrecision;
        cInPrecision = campaign.formulaData.cInPrecision;
        tInPrecision = campaign.formulaData.tInPrecision;
        link = campaign.link;
        options = campaign.options;
    }

    function getCampaignVoteCountData(uint campaignID) external view returns(uint[] memory voteCounts, uint totalVoteCount) {
        CampaignVoteData memory voteData = campaignData[campaignID].campaignVoteData;
        totalVoteCount = voteData.totalVotes;
        voteCounts = voteData.votePerOption;
    }

    /**
    * @dev return campaign winning option and its value
    *      return (0, 0) if campaign does not exist
    *      return (0, 0) if campaign has not ended yet
    *      return (0, 0) if campaign has no winning option based on the formula
    * @param campaignID id of campaign to get result
    */
    function getCampaignWinningOptionAndValue(uint campaignID)
        public view
        returns(uint optionID, uint value)
    {
        Campaign storage campaign = campaignData[campaignID];
        if (!campaign.campaignExists) { return (0, 0); } // not exist

        // not found or not ended yet, return 0 as winning option
        if (campaign.endTimestamp == 0 || campaign.endTimestamp > now) { return (0, 0); }

        uint totalSupply = campaign.totalKNCSupply;
        // something is wrong here, total KNC supply shouldn't be 0
        if (totalSupply == 0) { return (0, 0); }

        uint totalVotes = campaign.campaignVoteData.totalVotes;
        uint[] memory voteCounts = campaign.campaignVoteData.votePerOption;

        // Finding option with most votes
        uint winningOption = 0;
        uint maxVotedCount = 0;
        for (uint i = 0; i < voteCounts.length; i++) {
            if (voteCounts[i] > maxVotedCount) {
                winningOption = i + 1;
                maxVotedCount = voteCounts[i];
            } else if (voteCounts[i] == maxVotedCount) {
                winningOption = 0;
            }
        }

        // more than 1 options have same vote count
        if (winningOption == 0) { return (0, 0); }

        FormulaData memory formulaData = campaign.formulaData;

        // compute voted percentage (in precision)
        uint votedPercentage = totalVotes.mul(PRECISION).div(campaign.totalKNCSupply);

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
        value = campaign.options[optionID - 1];
    }

    /**
    * @dev return latest network fee with expiry timestamp
    */
    function getLatestNetworkFeeData() public view returns(uint feeInBps, uint expiryTimestamp) {
        uint curEpoch = getCurrentEpochNumber();
        feeInBps = latestNetworkFeeResult;
        // expiryTimestamp = firstEpochStartTimestamp + curEpoch * epochPeriodInSeconds - 1;
        expiryTimestamp = firstEpochStartTimestamp.add(curEpoch.mul(epochPeriodInSeconds)).sub(1);
        if (curEpoch == 0) {
            return (feeInBps, expiryTimestamp);
        }
        uint campaignID = networkFeeCampaigns[curEpoch.sub(1)];
        if (campaignID == 0) {
            // don't have network fee campaign, return latest result
            return (feeInBps, expiryTimestamp);
        }

        uint winningOption;
        (winningOption, feeInBps) = getCampaignWinningOptionAndValue(campaignID);
        if (winningOption == 0) {
            // fallback to previous result
            feeInBps = latestNetworkFeeResult;
        }
        return (feeInBps, expiryTimestamp);
    }

    /**
    * @dev  return staker's reward percentage in precision for an epoch
    *       return 0 if epoch is in the future
    *       return 0 if staker has no votes or stakes
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
    function getListCampIDs(uint epoch) external view returns(uint[] memory campaignIDs) {
        return epochCampaigns[epoch];
    }

    /** 
    * @dev return latest brr data after decoded so it is easily to check from read contract
    */
    function getLatestBRRDataDecoded()
        public view
        returns(uint burnInBps, uint rewardInBps, uint rebateInBps, uint epoch, uint expiryTimestamp)
    {
        epoch = getCurrentEpochNumber();
        // expiryTimestamp = firstEpochStartTimestamp + epoch * epochPeriodInSeconds - 1;
        expiryTimestamp = firstEpochStartTimestamp.add(epoch.mul(epochPeriodInSeconds)).sub(1);
        rewardInBps = latestBrrData.rewardInBps;
        rebateInBps = latestBrrData.rebateInBps;

        if (epoch > 0) {
            uint campaignID = brrCampaigns[epoch.sub(1)];
            if (campaignID != 0) {
                uint winningOption;
                uint brrData;
                (winningOption, brrData) = getCampaignWinningOptionAndValue(campaignID);
                if (winningOption > 0) {
                    // has winning option, update reward and rebate value
                    (rebateInBps, rewardInBps) = getRebateAndRewardFromData(brrData);
                }
            }
        }

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
    * @dev  helper func to get encoded reward and rebate
    *       revert if validation failed
    */
    function getDataFromRewardAndRebateWithValidation(uint rewardInBps, uint rebateInBps)
        public pure
        returns(uint data)
    {
        require(rewardInBps.add(rebateInBps) <= BPS, "reward plus rebate high");
        data = (rebateInBps.mul(POWER_128)).add(rewardInBps);
    }

    /**
    * @dev Validate params to check if we could submit a new campaign with these params
    */
    function validateCampaignParams(
        CampaignType campaignType, uint startTimestamp, uint endTimestamp, uint startEpoch,
        uint minPercentageInPrecision, uint cInPrecision, uint tInPrecision,
        uint[] memory options
    )
        public view returns(bool)
    {
        // now <= start timestamp < end timestamp
        require(
            startTimestamp >= now,
            "validateParams: can't start in the past"
        );
        // campaign duration must be at least min campaign duration
        // endTimestamp - startTimestamp + 1 >= minCampaignDurationInSeconds,
        require(
            endTimestamp.add(1) >= startTimestamp.add(minCampaignDurationInSeconds),
            "validateParams: campaign duration is low"
        );

        uint currentEpoch = getCurrentEpochNumber();
        uint endEpoch = getEpochNumber(endTimestamp);
        // start timestamp and end timestamp must be in the same epoch
        require(
            startEpoch == endEpoch,
            "validateParams: start & end not same epoch"
        );

        require(
            startEpoch <= currentEpoch.add(1),
            "validateParams: only for current or next epochs"
        );

        // verify number of options
        uint numOptions = options.length;
        require(
            numOptions > 1 && numOptions <= MAX_CAMPAIGN_OPTIONS,
            "validateParams: invalid number of options"
        );

        // Validate option values based on campaign type
        if (campaignType == CampaignType.General) {
            // option must be positive number
            for (uint i = 0; i < options.length; i++) {
                require(
                    options[i] > 0,
                    "validateParams: general campaign option is 0"
                );
            }
        } else if (campaignType == CampaignType.NetworkFee) {
            // network fee campaign, option must be fee in bps
            for (uint i = 0; i < options.length; i++) {
                // in Network, maximum fee that can be taken from 1 tx is (platform fee + 2 * network fee)
                // so network fee should be less than 50%
                require(
                    options[i] < BPS / 2,
                    "validateParams: Fee campaign option value is too high"
                );
            }
        } else {
            // brr fee handler campaign, option must be combined for reward + rebate %
            for (uint i = 0; i < options.length; i++) {
                // first 128 bits is rebate, last 128 bits is reward
                (uint rebateInBps, uint rewardInBps) = getRebateAndRewardFromData(options[i]);
                require(
                    rewardInBps.add(rebateInBps) <= BPS,
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
    function validateVoteOption(uint campaignID, uint option) internal view returns(bool) {
        Campaign storage campaign = campaignData[campaignID];
        require(campaign.campaignExists, "vote: campaign doesn't exist");

        require(campaign.startTimestamp <= now, "vote: campaign not started");
        require(campaign.endTimestamp >= now, "vote: campaign already ended");

        // option is indexed from 1 to options.length
        require(option > 0, "vote: option is 0");
        require(option <= campaign.options.length, "vote: option is not in range");

        return true;
    }
}
