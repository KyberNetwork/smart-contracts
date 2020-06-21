pragma solidity 0.6.6;

import "./EpochUtils.sol";
import "./DaoOperator.sol";
import "./KyberStaking.sol";
import "../IERC20.sol";
import "../IKyberDao.sol";
import "../utils/zeppelin/ReentrancyGuard.sol";
import "../utils/Utils5.sol";

/**
 * @notice  This contract is using SafeMath for uint, which is inherited from EpochUtils
            Some events are moved to interface, easier for public uses
 * @dev Network fee campaign: options are fee in bps
 *      BRR fee handler campaign: options are combined of rebate (left most 128 bits) + reward (right most 128 bits)
 *      General campaign: options are from 1 to num_options
 */
contract KyberDao is IKyberDao, EpochUtils, ReentrancyGuard, Utils5, DaoOperator {
    // max number of campaigns for each epoch
    uint256 public   constant MAX_EPOCH_CAMPAIGNS = 10;
    // max number of options for each campaign
    uint256 public   constant MAX_CAMPAIGN_OPTIONS = 8;
    uint256 internal constant POWER_128 = 2**128;

    enum CampaignType {General, NetworkFee, FeeHandlerBRR}

    struct FormulaData {
        uint256 minPercentageInPrecision;
        uint256 cInPrecision;
        uint256 tInPrecision;
    }

    struct CampaignVoteData {
        uint256 totalVotes;
        uint256[] votePerOption;
    }

    struct Campaign {
        CampaignType campaignType;
        bool campaignExists;
        uint256 startTimestamp;
        uint256 endTimestamp;
        uint256 totalKNCSupply; // total KNC supply at the time campaign was created
        FormulaData formulaData; // formula params for concluding campaign result
        bytes link; // link to KIP, explaination of options, etc.
        uint256[] options; // data of options
        CampaignVoteData campaignVoteData; // campaign vote data: total votes + vote per option
    }

    struct BRRData {
        uint256 rewardInBps;
        uint256 rebateInBps;
    }

    uint256 public minCampaignDurationInSeconds = 4 days;
    IERC20 public immutable kncToken;
    IKyberStaking public immutable staking;

    // use to generate increasing campaign ID
    uint256 public numberCampaigns = 0;
    mapping(uint256 => Campaign) internal campaignData;

    // epochCampaigns[epoch]: list campaign IDs for an epoch (epoch => campaign IDs)
    mapping(uint256 => uint256[]) internal epochCampaigns;
    // totalEpochPoints[epoch]: total points for an epoch (epoch => total points)
    mapping(uint256 => uint256) internal totalEpochPoints;
    // numberVotes[staker][epoch]: number of campaigns that the staker has voted in an epoch
    mapping(address => mapping(uint256 => uint256)) public numberVotes;
    // stakerVotedOption[staker][campaignID]: staker's voted option ID for a campaign
    mapping(address => mapping(uint256 => uint256)) public stakerVotedOption;

    uint256 internal latestNetworkFeeResult;
    // epoch => campaignID for network fee campaigns
    mapping(uint256 => uint256) public networkFeeCampaigns;
    // latest BRR data (reward and rebate in bps)
    BRRData internal latestBrrData;
    // epoch => campaignID for brr campaigns
    mapping(uint256 => uint256) public brrCampaigns;

    event NewCampaignCreated(
        CampaignType campaignType,
        uint256 indexed campaignID,
        uint256 startTimestamp,
        uint256 endTimestamp,
        uint256 minPercentageInPrecision,
        uint256 cInPrecision,
        uint256 tInPrecision,
        uint256[] options,
        bytes link
    );

    event CancelledCampaign(uint256 indexed campaignID);

    constructor(
        uint256 _epochPeriod,
        uint256 _startTimestamp,
        IERC20 _knc,
        uint256 _defaultNetworkFeeBps,
        uint256 _defaultRewardBps,
        uint256 _defaultRebateBps,
        address _daoOperator
    ) public DaoOperator(_daoOperator) {
        require(_epochPeriod > 0, "ctor: epoch period is 0");
        require(_startTimestamp >= now, "ctor: start in the past");
        require(_knc != IERC20(0), "ctor: knc token 0");
        // in Network, maximum fee that can be taken from 1 tx is (platform fee + 2 * network fee)
        // so network fee should be less than 50%
        require(_defaultNetworkFeeBps < BPS / 2, "ctor: network fee high");
        require(_defaultRewardBps.add(_defaultRebateBps) <= BPS, "reward plus rebate high");

        epochPeriodInSeconds = _epochPeriod;
        firstEpochStartTimestamp = _startTimestamp;
        kncToken = _knc;

        latestNetworkFeeResult = _defaultNetworkFeeBps;
        latestBrrData = BRRData({
            rewardInBps: _defaultRewardBps,
            rebateInBps: _defaultRebateBps
        });

        // deploy staking contract 
        staking = new KyberStaking({
            _kncToken: _knc,
            _epochPeriod: _epochPeriod,
            _startTimestamp: _startTimestamp,
            _kyberDao: IKyberDao(this)
        });
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
    function handleWithdrawal(address staker, uint256 reduceAmount) external override onlyStakingContract {
        // staking shouldn't call this func with reduce amount = 0
        if (reduceAmount == 0) {
            return;
        }
        uint256 curEpoch = getCurrentEpochNumber();

        uint256 numVotes = numberVotes[staker][curEpoch];
        // staker has not participated in any campaigns at the current epoch
        if (numVotes == 0) {
            return;
        }

        // update total points for current epoch
        totalEpochPoints[curEpoch] = totalEpochPoints[curEpoch].sub(numVotes.mul(reduceAmount));

        // update voted count for each campaign staker has voted
        uint256[] memory campaignIDs = epochCampaigns[curEpoch];

        for (uint256 i = 0; i < campaignIDs.length; i++) {
            uint256 campaignID = campaignIDs[i];

            uint256 votedOption = stakerVotedOption[staker][campaignID];
            if (votedOption == 0) {
                continue;
            } // staker has not voted yet

            Campaign storage campaign = campaignData[campaignID];
            if (campaign.endTimestamp >= now) {
                // the staker has voted for this campaign and the campaign has not ended yet
                // reduce total votes and vote count of staker's voted option
                campaign.campaignVoteData.totalVotes =
                    campaign.campaignVoteData.totalVotes.sub(reduceAmount);
                campaign.campaignVoteData.votePerOption[votedOption - 1] =
                    campaign.campaignVoteData.votePerOption[votedOption - 1].sub(reduceAmount);
            }
        }
    }

    /**
     * @dev create new campaign, only called by daoOperator
     * @param campaignType type of campaign (General, NetworkFee, FeeHandlerBRR)
     * @param startTimestamp timestamp to start running the campaign
     * @param endTimestamp timestamp to end this campaign
     * @param minPercentageInPrecision min percentage (in precision) for formula to conclude campaign
     * @param cInPrecision c value (in precision) for formula to conclude campaign
     * @param tInPrecision t value (in precision) for formula to conclude campaign
     * @param options list values of options to vote for this campaign
     * @param link additional data for this campaign
     */
    function submitNewCampaign(
        CampaignType campaignType,
        uint256 startTimestamp,
        uint256 endTimestamp,
        uint256 minPercentageInPrecision,
        uint256 cInPrecision,
        uint256 tInPrecision,
        uint256[] calldata options,
        bytes calldata link
    ) external onlyDaoOperator returns (uint256 campaignID) {
        // campaign epoch could be different from current epoch
        // as we allow to create campaign of next epoch as well
        uint256 campaignEpoch = getEpochNumber(startTimestamp);

        validateCampaignParams(
            campaignType,
            startTimestamp,
            endTimestamp,
            minPercentageInPrecision,
            cInPrecision,
            tInPrecision,
            options
        );

        numberCampaigns = numberCampaigns.add(1);
        campaignID = numberCampaigns;

        // add campaignID into the list campaign IDs
        epochCampaigns[campaignEpoch].push(campaignID);
        // update network fee or fee handler brr campaigns
        if (campaignType == CampaignType.NetworkFee) {
            networkFeeCampaigns[campaignEpoch] = campaignID;
        } else if (campaignType == CampaignType.FeeHandlerBRR) {
            brrCampaigns[campaignEpoch] = campaignID;
        }

        FormulaData memory formulaData = FormulaData({
            minPercentageInPrecision: minPercentageInPrecision,
            cInPrecision: cInPrecision,
            tInPrecision: tInPrecision
        });
        CampaignVoteData memory campaignVoteData = CampaignVoteData({
            totalVotes: 0,
            votePerOption: new uint256[](options.length)
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
            campaignType,
            campaignID,
            startTimestamp,
            endTimestamp,
            minPercentageInPrecision,
            cInPrecision,
            tInPrecision,
            options,
            link
        );
    }

    /**
     * @dev  cancel a campaign with given id, called by daoOperator only
     *       only can cancel campaigns that have not started yet
     * @param campaignID id of the campaign to cancel
     */
    function cancelCampaign(uint256 campaignID) external onlyDaoOperator {
        Campaign storage campaign = campaignData[campaignID];
        require(campaign.campaignExists, "cancelCampaign: campaignID doesn't exist");

        require(campaign.startTimestamp > now, "cancelCampaign: campaign already started");

        uint256 epoch = getEpochNumber(campaign.startTimestamp);

        if (campaign.campaignType == CampaignType.NetworkFee) {
            delete networkFeeCampaigns[epoch];
        } else if (campaign.campaignType == CampaignType.FeeHandlerBRR) {
            delete brrCampaigns[epoch];
        }

        delete campaignData[campaignID];

        uint256[] storage campaignIDs = epochCampaigns[epoch];
        for (uint256 i = 0; i < campaignIDs.length; i++) {
            if (campaignIDs[i] == campaignID) {
                // remove this campaign id out of list
                campaignIDs[i] = campaignIDs[campaignIDs.length - 1];
                campaignIDs.pop();
                break;
            }
        }

        emit CancelledCampaign(campaignID);
    }

    /**
     * @dev  vote for an option of a campaign
     *       options are indexed from 1 to number of options
     * @param campaignID id of campaign to vote for
     * @param option id of options to vote for
     */
    function vote(uint256 campaignID, uint256 option) external override {
        validateVoteOption(campaignID, option);
        address staker = msg.sender;

        uint256 curEpoch = getCurrentEpochNumber();
        (uint256 stake, uint256 dStake, address representative) =
            staking.initAndReturnStakerDataForCurrentEpoch(staker);

        uint256 totalStake = representative == staker ? stake.add(dStake) : dStake;
        uint256 lastVotedOption = stakerVotedOption[staker][campaignID];

        CampaignVoteData storage voteData = campaignData[campaignID].campaignVoteData;

        if (lastVotedOption == 0) {
            // increase number campaigns that the staker has voted at the current epoch
            numberVotes[staker][curEpoch]++;

            totalEpochPoints[curEpoch] = totalEpochPoints[curEpoch].add(totalStake);
            // increase voted count for this option
            voteData.votePerOption[option - 1] =
                voteData.votePerOption[option - 1].add(totalStake);
            // increase total votes
            voteData.totalVotes = voteData.totalVotes.add(totalStake);
        } else if (lastVotedOption != option) {
            // deduce previous option voted count
            voteData.votePerOption[lastVotedOption - 1] =
                voteData.votePerOption[lastVotedOption - 1].sub(totalStake);
            // increase new option voted count
            voteData.votePerOption[option - 1] =
                voteData.votePerOption[option - 1].add(totalStake);
        }

        stakerVotedOption[staker][campaignID] = option;

        emit Voted(staker, curEpoch, campaignID, option);
    }

    /**
     * @dev get latest network fee data + expiry timestamp
     *    conclude network fee campaign if needed and caching latest result in KyberDao
     */
    function getLatestNetworkFeeDataWithCache()
        external
        override
        returns (uint256 feeInBps, uint256 expiryTimestamp)
    {
        (feeInBps, expiryTimestamp) = getLatestNetworkFeeData();
        // cache latest data
        latestNetworkFeeResult = feeInBps;
    }

    /**
     * @dev return latest burn/reward/rebate data, also affecting epoch + expiry timestamp
     *      conclude brr campaign if needed and caching latest result in KyberDao
     */
    function getLatestBRRDataWithCache()
        external
        override
        returns (
            uint256 burnInBps,
            uint256 rewardInBps,
            uint256 rebateInBps,
            uint256 epoch,
            uint256 expiryTimestamp
        )
    {
        (burnInBps, rewardInBps, rebateInBps, epoch, expiryTimestamp) = getLatestBRRData();
        latestBrrData.rewardInBps = rewardInBps;
        latestBrrData.rebateInBps = rebateInBps;
    }

    /**
     * @dev some epochs have reward but no one can claim, for example: epoch 0
     *      return true if should burn all that reward
     * @param epoch epoch to check for burning reward
     */
    function shouldBurnRewardForEpoch(uint256 epoch) external view override returns (bool) {
        uint256 curEpoch = getCurrentEpochNumber();
        if (epoch >= curEpoch) {
            return false;
        }
        return totalEpochPoints[epoch] == 0;
    }

    // return list campaign ids for epoch, excluding non-existed ones
    function getListCampaignIDs(uint256 epoch) external view returns (uint256[] memory campaignIDs) {
        campaignIDs = epochCampaigns[epoch];
    }

    // return total points for an epoch
    function getTotalEpochPoints(uint256 epoch) external view returns (uint256) {
        return totalEpochPoints[epoch];
    }

    function getCampaignDetails(uint256 campaignID)
        external
        view
        returns (
            CampaignType campaignType,
            uint256 startTimestamp,
            uint256 endTimestamp,
            uint256 totalKNCSupply,
            uint256 minPercentageInPrecision,
            uint256 cInPrecision,
            uint256 tInPrecision,
            bytes memory link,
            uint256[] memory options
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

    function getCampaignVoteCountData(uint256 campaignID)
        external
        view
        returns (uint256[] memory voteCounts, uint256 totalVoteCount)
    {
        CampaignVoteData memory voteData = campaignData[campaignID].campaignVoteData;
        totalVoteCount = voteData.totalVotes;
        voteCounts = voteData.votePerOption;
    }

    /**
     * @dev  return staker's reward percentage in precision for a past epoch only
     *       fee handler should call this function when a staker wants to claim reward
     *       return 0 if staker has no votes or stakes
     */
    function getPastEpochRewardPercentageInPrecision(address staker, uint256 epoch)
        external
        view
        override
        returns (uint256)
    {
        // return 0 if epoch is not past epoch
        uint256 curEpoch = getCurrentEpochNumber();
        if (epoch >= curEpoch) {
            return 0;
        }

        return getRewardPercentageInPrecision(staker, epoch);
    }

    /**
     * @dev  return staker's reward percentage in precision for the current epoch
     */
    function getCurrentEpochRewardPercentageInPrecision(address staker)
        external
        view
        override
        returns (uint256)
    {
        uint256 curEpoch = getCurrentEpochNumber();
        return getRewardPercentageInPrecision(staker, curEpoch);
    }

    /**
     * @dev return campaign winning option and its value
     *      return (0, 0) if campaign does not exist
     *      return (0, 0) if campaign has not ended yet
     *      return (0, 0) if campaign has no winning option based on the formula
     * @param campaignID id of campaign to get result
     */
    function getCampaignWinningOptionAndValue(uint256 campaignID)
        public
        view
        returns (uint256 optionID, uint256 value)
    {
        Campaign storage campaign = campaignData[campaignID];
        if (!campaign.campaignExists) {
            return (0, 0);
        } // not exist

        // campaign has not ended yet, return 0 as winning option
        if (campaign.endTimestamp > now) {
            return (0, 0);
        }

        uint256 totalSupply = campaign.totalKNCSupply;
        // something is wrong here, total KNC supply shouldn't be 0
        if (totalSupply == 0) {
            return (0, 0);
        }

        uint256 totalVotes = campaign.campaignVoteData.totalVotes;
        uint256[] memory voteCounts = campaign.campaignVoteData.votePerOption;

        // Finding option with most votes
        uint256 winningOption = 0;
        uint256 maxVotedCount = 0;
        for (uint256 i = 0; i < voteCounts.length; i++) {
            if (voteCounts[i] > maxVotedCount) {
                winningOption = i + 1;
                maxVotedCount = voteCounts[i];
            } else if (voteCounts[i] == maxVotedCount) {
                winningOption = 0;
            }
        }

        // more than 1 options have same vote count
        if (winningOption == 0) {
            return (0, 0);
        }

        FormulaData memory formulaData = campaign.formulaData;

        // compute voted percentage (in precision)
        uint256 votedPercentage = totalVotes.mul(PRECISION).div(campaign.totalKNCSupply);

        // total voted percentage is below min acceptable percentage, no winning option
        if (formulaData.minPercentageInPrecision > votedPercentage) {
            return (0, 0);
        }

        // as we already limit value for c & t, no need to check for overflow here
        uint256 x = formulaData.tInPrecision.mul(votedPercentage).div(PRECISION);
        if (x <= formulaData.cInPrecision) {
            // threshold is not negative, need to compare with voted count
            uint256 y = formulaData.cInPrecision.sub(x);
            // (most voted option count / total votes) is below threshold, no winining option
            if (maxVotedCount.mul(PRECISION) < y.mul(totalVotes)) {
                return (0, 0);
            }
        }

        optionID = winningOption;
        value = campaign.options[optionID - 1];
    }

    /**
     * @dev return latest network fee and expiry timestamp
     */
    function getLatestNetworkFeeData()
        public
        view
        override
        returns (uint256 feeInBps, uint256 expiryTimestamp)
    {
        uint256 curEpoch = getCurrentEpochNumber();
        feeInBps = latestNetworkFeeResult;
        // expiryTimestamp = firstEpochStartTimestamp + curEpoch * epochPeriodInSeconds - 1;
        expiryTimestamp = firstEpochStartTimestamp.add(curEpoch.mul(epochPeriodInSeconds)).sub(1);
        if (curEpoch == 0) {
            return (feeInBps, expiryTimestamp);
        }
        uint256 campaignID = networkFeeCampaigns[curEpoch.sub(1)];
        if (campaignID == 0) {
            // don't have network fee campaign, return latest result
            return (feeInBps, expiryTimestamp);
        }

        uint256 winningOption;
        (winningOption, feeInBps) = getCampaignWinningOptionAndValue(campaignID);
        if (winningOption == 0) {
            // fallback to previous result
            feeInBps = latestNetworkFeeResult;
        }
        return (feeInBps, expiryTimestamp);
    }

    /**
     * @dev return latest brr result, conclude brr campaign if needed
     */
    function getLatestBRRData()
        public
        view
        returns (
            uint256 burnInBps,
            uint256 rewardInBps,
            uint256 rebateInBps,
            uint256 epoch,
            uint256 expiryTimestamp
        )
    {
        epoch = getCurrentEpochNumber();
        // expiryTimestamp = firstEpochStartTimestamp + epoch * epochPeriodInSeconds - 1;
        expiryTimestamp = firstEpochStartTimestamp.add(epoch.mul(epochPeriodInSeconds)).sub(1);
        rewardInBps = latestBrrData.rewardInBps;
        rebateInBps = latestBrrData.rebateInBps;

        if (epoch > 0) {
            uint256 campaignID = brrCampaigns[epoch.sub(1)];
            if (campaignID != 0) {
                uint256 winningOption;
                uint256 brrData;
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
    function getRebateAndRewardFromData(uint256 data)
        public
        pure
        returns (uint256 rebateInBps, uint256 rewardInBps)
    {
        rewardInBps = data & (POWER_128.sub(1));
        rebateInBps = (data.div(POWER_128)) & (POWER_128.sub(1));
    }

    /**
     * @dev  helper func to get encoded reward and rebate
     *       revert if validation failed
     */
    function getDataFromRewardAndRebateWithValidation(uint256 rewardInBps, uint256 rebateInBps)
        public
        pure
        returns (uint256 data)
    {
        require(rewardInBps.add(rebateInBps) <= BPS, "reward plus rebate high");
        data = (rebateInBps.mul(POWER_128)).add(rewardInBps);
    }

    /**
     * @dev options are indexed from 1
     */
    function validateVoteOption(uint256 campaignID, uint256 option) internal view {
        Campaign storage campaign = campaignData[campaignID];
        require(campaign.campaignExists, "vote: campaign doesn't exist");

        require(campaign.startTimestamp <= now, "vote: campaign not started");
        require(campaign.endTimestamp >= now, "vote: campaign already ended");

        // option is indexed from 1 to options.length
        require(option > 0, "vote: option is 0");
        require(option <= campaign.options.length, "vote: option is not in range");
    }

    /**
     * @dev Validate params to check if we could submit a new campaign with these params
     */
    function validateCampaignParams(
        CampaignType campaignType,
        uint256 startTimestamp,
        uint256 endTimestamp,
        uint256 minPercentageInPrecision,
        uint256 cInPrecision,
        uint256 tInPrecision,
        uint256[] memory options
    ) internal view {
        // now <= start timestamp < end timestamp
        require(startTimestamp >= now, "validateParams: start in the past");
        // campaign duration must be at least min campaign duration
        // endTimestamp - startTimestamp + 1 >= minCampaignDurationInSeconds,
        require(
            endTimestamp.add(1) >= startTimestamp.add(minCampaignDurationInSeconds),
            "validateParams: campaign duration is low"
        );

        uint256 startEpoch = getEpochNumber(startTimestamp);
        uint256 endEpoch = getEpochNumber(endTimestamp);

        require(
            epochCampaigns[startEpoch].length < MAX_EPOCH_CAMPAIGNS,
            "validateParams: too many campaigns"
        );

        // start timestamp and end timestamp must be in the same epoch
        require(startEpoch == endEpoch, "validateParams: start & end not same epoch");

        uint256 currentEpoch = getCurrentEpochNumber();
        require(
            startEpoch <= currentEpoch.add(1),
            "validateParams: only for current or next epochs"
        );

        // verify number of options
        uint256 numOptions = options.length;
        require(
            numOptions > 1 && numOptions <= MAX_CAMPAIGN_OPTIONS,
            "validateParams: invalid number of options"
        );

        // Validate option values based on campaign type
        if (campaignType == CampaignType.General) {
            // option must be positive number
            for (uint256 i = 0; i < options.length; i++) {
                require(options[i] > 0, "validateParams: general campaign option is 0");
            }
        } else if (campaignType == CampaignType.NetworkFee) {
            require(
                networkFeeCampaigns[startEpoch] == 0,
                "validateParams: already had network fee campaign for this epoch"
            );
            // network fee campaign, option must be fee in bps
            for (uint256 i = 0; i < options.length; i++) {
                // in Network, maximum fee that can be taken from 1 tx is (platform fee + 2 * network fee)
                // so network fee should be less than 50%
                require(
                    options[i] < BPS / 2,
                    "validateParams: network fee must be smaller then BPS / 2"
                );
            }
        } else {
            require(
                brrCampaigns[startEpoch] == 0,
                "validateParams: already had brr campaign for this epoch"
            );
            // brr fee handler campaign, option must be combined for reward + rebate %
            for (uint256 i = 0; i < options.length; i++) {
                // rebate (left most 128 bits) + reward (right most 128 bits)
                (uint256 rebateInBps, uint256 rewardInBps) =
                    getRebateAndRewardFromData(options[i]);
                require(
                    rewardInBps.add(rebateInBps) <= BPS,
                    "validateParams: rebate + reward can't be bigger than BPS"
                );
            }
        }

        // percentage should be smaller than or equal 100%
        require(minPercentageInPrecision <= PRECISION, "validateParams: min percentage is high");

        // limit value of c and t to avoid overflow
        require(cInPrecision < POWER_128, "validateParams: c is high");

        require(tInPrecision < POWER_128, "validateParams: t is high");
    }

    /**
     * @dev  return staker's reward percentage in precision for an epoch
     *       return 0 if staker has no votes or stakes
     *       called by 2 functions in KyberDao
     */
    function getRewardPercentageInPrecision(address staker, uint256 epoch)
        internal
        view
        returns (uint256)
    {
        uint256 numVotes = numberVotes[staker][epoch];
        // no votes, no rewards
        if (numVotes == 0) {
            return 0;
        }

        (uint256 stake, uint256 delegatedStake, address representative) =
            staking.getStakerRawData(staker, epoch);

        uint256 totalStake = representative == staker ? stake.add(delegatedStake) : delegatedStake;
        if (totalStake == 0) {
            return 0;
        }

        uint256 points = numVotes.mul(totalStake);
        uint256 totalPts = totalEpochPoints[epoch];

        // staker's reward percentage should be <= 100%
        assert(points <= totalPts);

        return points.mul(PRECISION).div(totalPts);
    }
}
