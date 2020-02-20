pragma solidity 0.5.11;


import "./EpochUtils.sol";
import "../IERC20.sol";
import "./IKyberStaking.sol";
import "../IKyberDAO.sol";
import "../ReentrancyGuard.sol";
import "../UtilsV5.sol";


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
        require(msg.sender == campaignCreator);
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
        require(newCampCreator != address(0));
        emit TransferCampaignCreatorPending(newCampCreator);
        emit CampaignCreatorClaimed(newCampCreator, campaignCreator);
        campaignCreator = newCampCreator;
    }

    event CampaignCreatorClaimed( address newAdmin, address previousAdmin);

    /**
     * @dev Allows the pendingCampCreator address to finalize the change campaign creator process.
     */
    function claimCampaignCreator() public {
        require(pendingCampCreator == msg.sender);
        emit CampaignCreatorClaimed(pendingCampCreator, campaignCreator);
        campaignCreator = pendingCampCreator;
        pendingCampCreator = address(0);
    }
}

// Note: camp -> campaign
// Assumption:
// - Network fee campaign: options are fee in bps
// - BRR fee handler campaign: options are combined of rebate (first 128 bits) + reward (last 128 bits)
// - General campaign: options are from 1 to num_options

// This contract is using SafeMath for uint, which is inherited from EpochUtils
contract KyberDAO is IKyberDAO, EpochUtils, ReentrancyGuard, CampPermissionGroups, Utils {
    // Constants
    uint internal constant POWER_128 = 2 ** 128;
    uint internal constant POWER_84 = 2 ** 84;
    // max number of camps for each epoch
    uint public constant MAX_EPOCH_CAMPS = 10;

    uint public MAX_CAMP_OPTIONS = 4; // TODO: Finalise the value
    uint public MIN_CAMP_DURATION = 75000; // around 2 weeks time. TODO: Finalise the value

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
        uint totalKNCSupply;    // total KNC supply at the time campaign was created
        uint formulaParams;     // squeezing formula params into one number
        bytes link;             // link to KIP, explaination of options, etc.
        uint[] options;         // data of options
    }

    /* Mapping from campaign ID => data */
    // use to generate increasing camp ID
    uint public numberCampaigns = 0;
    mapping(uint => bool) public campExists;
    mapping(uint => Campaign) internal campaignData;
    // campOptionPoints[campID]: total points and points of each option for a campaign
    // campOptionPoints[campID][0] is total points, campOptionPoints[campID][1..] for each option ID
    mapping(uint => uint[]) internal campOptionPoints;
    // winningOptionData[campID]: winning option data for each campaign
    // 128 bits: has concluded campaign or not, last 128 bits: winning option ID
    mapping(uint => uint) internal winningOptionData;

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
        uint _defaultNetworkFee, uint _defaultBrrData,
        address _campaignCreator
    ) public CampPermissionGroups(_campaignCreator) {
        require(_epochPeriod > 0, "ctor: epoch period must be positive");
        require(_startBlock >= block.number, "ctor: startBlock shouldn't be in the past");
        require(_staking != address(0), "ctor: staking is missing");
        require(_feeHandler != address(0), "ctor: feeHandler is missing");
        require(_knc != address(0), "ctor: knc token is missing");
        require(_defaultNetworkFee <= BPS, "ctor: network fee is more than 100%");

        (uint rebateBps, uint rewardBps) = getRebateAndRewardFromData(_defaultBrrData);
        require(rebateBps + rewardBps <= BPS, "ctor: rebate + reward is more than 100%");

        staking = IKyberStaking(_staking);
        require(staking.EPOCH_PERIOD() == _epochPeriod, "ctor: different epoch period");
        require(staking.START_BLOCK() == _startBlock, "ctor: different start block");

        EPOCH_PERIOD = _epochPeriod;
        START_BLOCK = _startBlock;
        feeHandler = IFeeHandler(_feeHandler);
        kncToken = IERC20(_knc);
        latestNetworkFeeResult = _defaultNetworkFee;
        latestBrrResult = _defaultBrrData;
    }

    modifier onlyStakingContract {
        require(msg.sender == address(staking), "sender is not staking");
        _;
    }

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
                campOptionPoints[campID][0] = campOptionPoints[campID][0].sub(reduceAmount);
                campOptionPoints[campID][votedOption] = campOptionPoints[campID][votedOption].sub(reduceAmount);
            }
        }

        return true;
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
        public onlyCampaignCreator returns(uint campID)
    {
        uint curEpoch = getCurrentEpochNumber();

        require(
            epochCampaigns[curEpoch].length < MAX_EPOCH_CAMPS,
            "newCampaign: exceed max number camps for each epoch"
        );

        require(
            validateCampaignParams(campType, startBlock, endBlock, curEpoch, formulaParams, options),
            "newCampaign: validate camp params failed"
        );

        if (campType == CampaignType.NETWORK_FEE) {
            require(networkFeeCamp[curEpoch] == 0, "newCampaign: alr had one camp for network fee at this epoch");
        } else if (campType == CampaignType.FEE_HANDLER_BRR) {
            require(brrCampaign[curEpoch] == 0, "newCampaign: alr had one camp for brr at this epoch");
        }

        numberCampaigns = numberCampaigns.add(1);
        campID = numberCampaigns;

        campExists[campID] = true;
        // add campID into this current epoch camp IDs
        epochCampaigns[curEpoch].push(campID);
        // update network fee or brr campaigns
        if (campType == CampaignType.NETWORK_FEE) {
            networkFeeCamp[curEpoch] = campID;
        } else if (campType == CampaignType.FEE_HANDLER_BRR) {
            brrCampaign[curEpoch] = campID;
        }

        campaignData[campID] = Campaign({
            campID: campID,
            campType: campType,
            startBlock: startBlock,
            endBlock: endBlock,
            totalKNCSupply: kncToken.totalSupply(),
            link: link,
            formulaParams: formulaParams,
            options: options
        });

        // index 0 for total votes, index 1 -> options.length for each option
        campOptionPoints[campID] = new uint[](options.length + 1);

        emit NewCampaignCreated(CampaignType.NETWORK_FEE, campID, startBlock, endBlock, formulaParams, options, link);
    }

    event CancelledCampaign(uint campID);

    function cancelCampaign(uint campID) public onlyCampaignCreator {
        require(campExists[campID], "cancelCamp: campID does not exist");

        Campaign storage camp = campaignData[campID];

        require(camp.startBlock > block.number, "cancelCamp: campaign has started, can not cancel");

        uint curEpoch = getCurrentEpochNumber();

        campExists[campID] = false;

        if (camp.campType == CampaignType.NETWORK_FEE) {
            delete networkFeeCamp[curEpoch];
        } else if (camp.campType == CampaignType.FEE_HANDLER_BRR) {
            delete brrCampaign[curEpoch];
        }

        delete campaignData[campID];
        delete campOptionPoints[campID];

        uint[] storage campIDs = epochCampaigns[curEpoch];
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

    function vote(uint campID, uint option) public returns(bool) {
        require(validateVoteOption(campID, option), "vote: campID or vote option is invalid");
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
            campOptionPoints[campID][option] = campOptionPoints[campID][option].add(totalStake);
            // increase total voted points
            campOptionPoints[campID][0] = campOptionPoints[campID][0].add(totalStake);
        } else if (lastVotedOption != option) {
            // deduce previous option voted count
            campOptionPoints[campID][lastVotedOption] = campOptionPoints[campID][lastVotedOption].sub(totalStake);
            // increase new option voted count
            campOptionPoints[campID][option] = campOptionPoints[campID][option].add(totalStake);
        }

        stakerVotedOption[staker][campID] = option;

        emit Voted(staker, curEpoch, campID, option);
    }

    event RewardClaimed(address staker, uint epoch, uint perInPrecision);

    function claimReward(address staker, uint epoch) public nonReentrant {
        uint curEpoch = getCurrentEpochNumber();
        require(epoch < curEpoch, "claimReward: can not claim for current or future epoch");
        require(!hasClaimedReward[staker][epoch], "claimReward: already claimed reward for this epoch");

        uint perInPrecision = getStakerRewardPercentageInPrecision(staker, epoch);
        require(perInPrecision > 0, "claimReward: No reward to claim");

        hasClaimedReward[staker][epoch] = true;
        // call fee handler to claim reward
        require(feeHandler.claimStakerReward(staker, perInPrecision, epoch), "claimReward: feeHandle failed to claim reward");

        emit RewardClaimed(staker, epoch, perInPrecision);
    }

    // get latest network fee data + expiry data
    // also save winning option data and latest network fee result
    function getLatestNetworkFeeDataWithCache() public returns(uint feeInBps, uint expiryBlockNumber) {
        uint curEpoch = getCurrentEpochNumber();

        feeInBps = latestNetworkFeeResult;
        // expiryBlockNumber = START_BLOCK + curEpoch * EPOCH_PERIOD - 1;
        expiryBlockNumber = START_BLOCK.add(curEpoch.mul(EPOCH_PERIOD)).sub(1);

        // there is no camp for epoch 0
        if (curEpoch == 0) {
            return (feeInBps, expiryBlockNumber);
        }

        uint campID = networkFeeCamp[curEpoch.sub(1)];
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
        // expiryBlockNumber = START_BLOCK + curEpoch * EPOCH_PERIOD - 1;
        expiryBlockNumber = START_BLOCK.add(epoch.mul(EPOCH_PERIOD)).sub(1);
        uint brrData = latestBrrResult;
        if (epoch > 0) {
            uint campID = brrCampaign[epoch.sub(1)];
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
        burnInBps = BPS.sub(rebateInBps).sub(rewardInBps);
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
        uint[] memory votes = campOptionPoints[campID];
        if (votes.length == 0) {
            return (voteCounts, totalVoteCount);
        }
        totalVoteCount = votes[0];
        voteCounts = new uint[](votes.length - 1);
        for (uint i = 0; i < voteCounts.length; i++) {
            voteCounts[i] = votes[i + 1];
        }
    }

    function getCampaignOptionVoteCount(uint campID, uint optionID)
        public view
        returns(uint voteCount, uint totalVoteCount)
    {
        uint[] memory voteCounts = campOptionPoints[campID];
        if (voteCounts.length == 0 || optionID == 0 || optionID >= voteCounts.length) {
            return (voteCount, totalVoteCount);
        }
        voteCount = voteCounts[optionID];
        totalVoteCount = voteCounts[0];
    }

    function getCampaignWinningOptionAndValue(uint campID)
        public view
        returns(uint optionID, uint value)
    {
        if (!campExists[campID]) { return (0, 0); } // not exist

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
        // no one has voted in this epoch
        if (totalSupply == 0) { return (0, 0); }

        uint[] memory voteCounts = campOptionPoints[campID];

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

        FormulaData memory formulaData = decodeFormulaParams(camp.formulaParams);

        uint totalVotes = voteCounts[0];
        // compute voted percentage (in precision)
        uint votedPercentage = totalVotes.mul(PRECISION).div(camp.totalKNCSupply);

        // total voted percentage is below min acceptable percentage, no winning option
        if (formulaData.minPercentageInPrecision > votedPercentage) { return (0, 0); }

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

    // return latest network fee with expiry block number
    function getLatestNetworkFeeData() public view returns(uint feeInBps, uint expiryBlockNumber) {
        uint curEpoch = getCurrentEpochNumber();
        feeInBps = latestNetworkFeeResult;
        // expiryBlockNumber = START_BLOCK + curEpoch * EPOCH_PERIOD - 1;
        expiryBlockNumber = START_BLOCK.add(curEpoch.mul(EPOCH_PERIOD)).sub(1);
        if (curEpoch == 0) {
            return (feeInBps, expiryBlockNumber);
        }
        uint campID = networkFeeCamp[curEpoch.sub(1)];
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

    // Helper functions for squeezing data
    function getRebateAndRewardFromData(uint data)
        public pure
        returns(uint rebateInBps, uint rewardInBps)
    {
        rewardInBps = data & (POWER_128.sub(1));
        rebateInBps = (data.div(POWER_128)) & (POWER_128.sub(1));
    }

    // revert here so if our operations use this func to generate data for new camp,
    // they can be aware when params are invalid
    function getDataFromRewardAndRebateWithValidation(uint rewardInBps, uint rebateInBps)
        public pure
        returns(uint data)
    {
        require(rewardInBps.add(rebateInBps) <= BPS);
        data = (rebateInBps.mul(POWER_128)).add(rewardInBps);
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
            "validateParams: can not start in the past"
        );
        // camp duration must be at least min camp duration
        // endBlock - startBlock + 1 >= MIN_CAMP_DURATION,
        require(
            endBlock.add(1) >= startBlock.add(MIN_CAMP_DURATION),
            "validateParams: camp duration is lower than min camp duration"
        );

        uint startEpoch = getEpochNumber(startBlock);
        uint endEpoch = getEpochNumber(endBlock);
        // start + end blocks must be in the same current epoch
        require(
            startEpoch == currentEpoch && endEpoch == currentEpoch,
            "validateParams: start and end block must be in current epoch"
        );

        // verify number of options
        uint numOptions = options.length;
        require(
            numOptions > 1 && numOptions <= MAX_CAMP_OPTIONS,
            "validateParams: number options is invalid"
        );

        // Validate option values based on campaign type
        if (campType == CampaignType.GENERAL) {
            // option must be positive number
            for (uint i = 0; i < options.length; i++) {
                require(
                    options[i] > 0,
                    "validateParams: general camp options must be positive"
                );
            }
        } else if (campType == CampaignType.NETWORK_FEE) {
            // network fee campaign, option must be fee in bps
            for (uint i = 0; i < options.length; i++) {
                // fee must <= 100%
                require(
                    options[i] <= BPS,
                    "validateParams: NetworkFee camp options must be smaller than or equal 100%"
                );
            }
        } else if (campType == CampaignType.FEE_HANDLER_BRR) {
            // brr fee handler campaign, option must be combined for reward + rebate %
            for (uint i = 0; i < options.length; i++) {
                // first 128 bits is rebate, last 128 bits is reward
                (uint rebateInBps, uint rewardInBps) = getRebateAndRewardFromData(options[i]);
                require(
                    rewardInBps + rebateInBps <= BPS,
                    "validateParams: BRR camp options must be smaller than or equal 100%"
                );
            }
        } else {
            require(false, "validateParams: invalid camp type");
        }

        FormulaData memory data = decodeFormulaParams(formulaParams);
        // percentage should be smaller than or equal 100%
        require(
            data.minPercentageInPrecision <= PRECISION,
            "validateParams: formula min percentage must not be greater than 100%"
        );

        return true;
    }

    function encodeFormulaParams(
        uint minPercentageInPrecision, uint cInPrecision, uint tInPrecision
    ) public pure returns(uint data) {
        require(minPercentageInPrecision <= PRECISION);
        require(cInPrecision < POWER_84);
        require(tInPrecision < POWER_84);

        data = minPercentageInPrecision & (POWER_84.sub(1));
        data |= (cInPrecision & (POWER_84.sub(1))).mul(POWER_84);
        data |= (tInPrecision & (POWER_84.sub(1))).mul(POWER_84).mul(POWER_84);
    }

    // Note: option is indexed from 1
    function validateVoteOption(uint campID, uint option) internal view returns(bool) {
        require(campExists[campID], "vote: camp does not exist");

        Campaign storage camp = campaignData[campID];

        require(camp.startBlock <= block.number, "vote: camp is not started yet");
        require(camp.endBlock >= block.number, "vote: camp has already ended");

        require(option > 0, "vote: option must be positive");
        require(option <= camp.options.length, "vote: option must be in range");

        return true;
    }

    function decodeWinningOptionData(uint data) internal pure returns(bool hasConcluded, uint optionID) {
        hasConcluded = ((data.div(POWER_128)) & (POWER_128.sub(1))) == 1;
        optionID = data & (POWER_128.sub(1));
    }

    function encodeWinningOptionData(uint optionID, bool hasConcluded) internal pure returns(uint data) {
        data = optionID & (POWER_128.sub(1));
        if (hasConcluded) {
            data = data.add(POWER_128);
        }
    }

    function decodeFormulaParams(uint data) internal pure returns(FormulaData memory formulaData) {
        formulaData.minPercentageInPrecision = data & (POWER_84.sub(1));
        formulaData.cInPrecision = (data.div(POWER_84)) & (POWER_84.sub(1));
        formulaData.tInPrecision = (data.div(POWER_84.mul(POWER_84))) & (POWER_84.sub(1));
    }
}
