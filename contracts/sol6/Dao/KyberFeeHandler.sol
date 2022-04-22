pragma solidity 0.6.6;

import "../utils/Utils5.sol";
import "../utils/zeppelin/ReentrancyGuard.sol";
import "../InimbleDao.sol";
import "../InimbleFeeHandler.sol";
import "../InimbleNetworkProxy.sol";
import "../ISimplenimbleProxy.sol";
import "../IBurnableToken.sol";
import "./ISanityRate.sol";
import "../utils/zeppelin/SafeMath.sol";
import "./DaoOperator.sol";

/**
 * @title InimbleProxy
 *  This interface combines two interfaces.
 *  It is needed since we use one function from each of the interfaces.
 *
 */
interface InimbleProxy is InimbleNetworkProxy, ISimplenimbleProxy {
    // empty block
}


/**
 * @title nimbleFeeHandler
 *
 * @dev nimbleFeeHandler works tightly with contracts nimbleNetwork and nimbleDao.
 *      Some events are moved to interface, for easier usage
 * @dev Terminology:
 *          Epoch - Voting campaign time frame in nimbleDao.
 *              nimbleDao voting campaigns are in the scope of epochs.
 *          BRR - Burn / Reward / Rebate. nimbleNetwork fee is used for 3 purposes:
 *              Burning NIM
 *              Reward an address that staked NIM in nimbleStaking contract. AKA - stakers
 *              Rebate reserves for supporting trades.
 * @dev Code flow:
 *      1. Accumulating && claiming Fees. Per trade on nimbleNetwork, it calls handleFees() function which
 *          internally accounts for network & platform fees from the trade. Fee distribution:
 *              rewards: accumulated per epoch. can be claimed by the nimbleDao after epoch is concluded.
 *              rebates: accumulated per rebate wallet, can be claimed any time.
 *              Burn: accumulated in the contract. Burned value and interval limited with safe check using
                    sanity rate.
 *              Platfrom fee: accumulated per platform wallet, can be claimed any time.
 *      2. Network Fee distribution: Per epoch nimbleFeeHandler contract reads BRR distribution percentage 
 *          from nimbleDao. When the data expires, nimbleFeeHandler reads updated values.
 */
contract nimbleFeeHandler is InimbleFeeHandler, Utils5, DaoOperator, ReentrancyGuard {
    using SafeMath for uint256;

    uint256 internal constant DEFAULT_REWARD_BPS = 3000;
    uint256 internal constant DEFAULT_REBATE_BPS = 3000;
    uint256 internal constant SANITY_RATE_DIFF_BPS = 1000; // 10%

    struct BRRData {
        uint64 expiryTimestamp;
        uint32 epoch;
        uint16 rewardBps;
        uint16 rebateBps;
    }

    struct BRRWei {
        uint256 rewardWei;
        uint256 fullRebateWei;
        uint256 paidRebateWei;
        uint256 burnWei;
    }

    InimbleDao public nimbleDao;
    InimbleProxy public nimbleProxy;
    address public nimbleNetwork;
    IERC20 public immutable NIM;

    uint256 public immutable burnBlockInterval;
    uint256 public lastBurnBlock;

    BRRData public brrAndEpochData;
    address public daoSetter;

    /// @dev amount of eth to burn for each burn NIM call
    uint256 public weiToBurn = 2 ether;

    mapping(address => uint256) public feePerPlatformWallet;
    mapping(address => uint256) public rebatePerWallet;
    mapping(uint256 => uint256) public rewardsPerEpoch;
    mapping(uint256 => uint256) public rewardsPaidPerEpoch;
    // hasClaimedReward[staker][epoch]: true/false if the staker has/hasn't claimed the reward for an epoch
    mapping(address => mapping (uint256 => bool)) public hasClaimedReward;
    uint256 public totalPayoutBalance; // total balance in the contract that is for rebate, reward, platform fee

    /// @dev use to get rate of NIM/ETH to check if rate to burn NIM is normal
    /// @dev index 0 is currently used contract address, indexes > 0 are older versions
    ISanityRate[] internal sanityRateContract;

    event FeeDistributed(
        IERC20 indexed token,
        address indexed platformWallet,
        uint256 platformFeeWei,
        uint256 rewardWei,
        uint256 rebateWei,
        address[] rebateWallets,
        uint256[] rebatePercentBpsPerWallet,
        uint256 burnAmtWei
    );

    event BRRUpdated(
        uint256 rewardBps,
        uint256 rebateBps,
        uint256 burnBps,
        uint256 expiryTimestamp,
        uint256 indexed epoch
    );

    event EthReceived(uint256 amount);
    event nimbleDaoAddressSet(InimbleDao nimbleDao);
    event BurnConfigSet(ISanityRate sanityRate, uint256 weiToBurn);
    event RewardsRemovedToBurn(uint256 indexed epoch, uint256 rewardsWei);
    event nimbleNetworkUpdated(address nimbleNetwork);
    event nimbleProxyUpdated(InimbleProxy nimbleProxy);

    constructor(
        address _daoSetter,
        InimbleProxy _nimbleProxy,
        address _nimbleNetwork,
        IERC20 _NIM,
        uint256 _burnBlockInterval,
        address _daoOperator
    ) public DaoOperator(_daoOperator) {
        require(_daoSetter != address(0), "daoSetter 0");
        require(_nimbleProxy != InimbleProxy(0), "nimbleNetworkProxy 0");
        require(_nimbleNetwork != address(0), "nimbleNetwork 0");
        require(_NIM != IERC20(0), "NIM 0");
        require(_burnBlockInterval != 0, "_burnBlockInterval 0");

        daoSetter = _daoSetter;
        nimbleProxy = _nimbleProxy;
        nimbleNetwork = _nimbleNetwork;
        NIM = _NIM;
        burnBlockInterval = _burnBlockInterval;

        //start with epoch 0
        updateBRRData(DEFAULT_REWARD_BPS, DEFAULT_REBATE_BPS, now, 0);
    }

    modifier onlynimbleDao {
        require(msg.sender == address(nimbleDao), "only nimbleDao");
        _;
    }

    modifier onlynimbleNetwork {
        require(msg.sender == address(nimbleNetwork), "only nimbleNetwork");
        _;
    }

    modifier onlyNonContract {
        require(tx.origin == msg.sender, "only non-contract");
        _;
    }

    receive() external payable {
        emit EthReceived(msg.value);
    }

    /// @dev handleFees function is called per trade on nimbleNetwork. unless the trade is not involving any fees.
    /// @param token Token currency of fees
    /// @param rebateWallets a list of rebate wallets that will get rebate for this trade.
    /// @param rebateBpsPerWallet percentage of rebate for each wallet, out of total rebate.
    /// @param platformWallet Wallet address that will receive the platfrom fee.
    /// @param platformFee Fee amount (in wei) the platfrom wallet is entitled to.
    /// @param networkFee Fee amount (in wei) to be allocated for BRR
    function handleFees(
        IERC20 token,
        address[] calldata rebateWallets,
        uint256[] calldata rebateBpsPerWallet,
        address platformWallet,
        uint256 platformFee,
        uint256 networkFee
    ) external payable override onlynimbleNetwork nonReentrant {
        require(token == ETH_TOKEN_ADDRESS, "token not eth");
        require(msg.value == platformFee.add(networkFee), "msg.value not equal to total fees");

        // handle platform fee
        feePerPlatformWallet[platformWallet] = feePerPlatformWallet[platformWallet].add(
            platformFee
        );

        if (networkFee == 0) {
            // only platform fee paid
            totalPayoutBalance = totalPayoutBalance.add(platformFee);
            emit FeeDistributed(
                ETH_TOKEN_ADDRESS,
                platformWallet,
                platformFee,
                0,
                0,
                rebateWallets,
                rebateBpsPerWallet,
                0
            );
            return;
        }

        BRRWei memory brrAmounts;
        uint256 epoch;

        // Decoding BRR data
        (brrAmounts.rewardWei, brrAmounts.fullRebateWei, epoch) = getRRWeiValues(networkFee);

        brrAmounts.paidRebateWei = updateRebateValues(
            brrAmounts.fullRebateWei, rebateWallets, rebateBpsPerWallet
        );
        brrAmounts.rewardWei = brrAmounts.rewardWei.add(
            brrAmounts.fullRebateWei.sub(brrAmounts.paidRebateWei)
        );

        rewardsPerEpoch[epoch] = rewardsPerEpoch[epoch].add(brrAmounts.rewardWei);

        // update total balance of rewards, rebates, fee
        totalPayoutBalance = totalPayoutBalance.add(
            platformFee).add(brrAmounts.rewardWei).add(brrAmounts.paidRebateWei
        );

        brrAmounts.burnWei = networkFee.sub(brrAmounts.rewardWei).sub(brrAmounts.paidRebateWei);
        emit FeeDistributed(
            ETH_TOKEN_ADDRESS,
            platformWallet,
            platformFee,
            brrAmounts.rewardWei,
            brrAmounts.paidRebateWei,
            rebateWallets,
            rebateBpsPerWallet,
            brrAmounts.burnWei
        );
    }

    /// @notice  WARNING When staker address is a contract,
    ///          it should be able to receive claimed reward in ETH whenever anyone calls this function.
    /// @dev not revert if already claimed or reward percentage is 0
    ///      allow writing a wrapper to claim for multiple epochs
    /// @param staker address.
    /// @param epoch for which epoch the staker is claiming the reward
    function claimStakerReward(
        address staker,
        uint256 epoch
    ) external override nonReentrant returns(uint256 amountWei) {
        if (hasClaimedReward[staker][epoch]) {
            // staker has already claimed reward for the epoch
            return 0;
        }

        // the relative part of the reward the staker is entitled to for the epoch.
        // units Precision: 10 ** 18 = 100%
        // if the epoch is current or in the future, nimbleDao will return 0 as result
        uint256 percentageInPrecision = nimbleDao.getPastEpochRewardPercentageInPrecision(staker, epoch);
        if (percentageInPrecision == 0) {
            return 0; // not revert, in case a wrapper wants to claim reward for multiple epochs
        }
        require(percentageInPrecision <= PRECISION, "percentage too high");

        // Amount of reward to be sent to staker
        amountWei = rewardsPerEpoch[epoch].mul(percentageInPrecision).div(PRECISION);

        // redundant check, can't happen
        assert(totalPayoutBalance >= amountWei);
        assert(rewardsPaidPerEpoch[epoch].add(amountWei) <= rewardsPerEpoch[epoch]);
        
        rewardsPaidPerEpoch[epoch] = rewardsPaidPerEpoch[epoch].add(amountWei);
        totalPayoutBalance = totalPayoutBalance.sub(amountWei);

        hasClaimedReward[staker][epoch] = true;

        // send reward to staker
        (bool success, ) = staker.call{value: amountWei}("");
        require(success, "staker rewards transfer failed");

        emit RewardPaid(staker, epoch, ETH_TOKEN_ADDRESS, amountWei);
    }

    /// @dev claim rebate per reserve wallet. called by any address
    /// @param rebateWallet the wallet to claim rebates for. Total accumulated rebate sent to this wallet.
    /// @return amountWei amount of rebate claimed
    function claimReserveRebate(address rebateWallet) 
        external 
        override 
        nonReentrant 
        returns (uint256 amountWei) 
    {
        require(rebatePerWallet[rebateWallet] > 1, "no rebate to claim");
        // Get total amount of rebate accumulated
        amountWei = rebatePerWallet[rebateWallet].sub(1);

        // redundant check, can't happen
        assert(totalPayoutBalance >= amountWei);
        totalPayoutBalance = totalPayoutBalance.sub(amountWei);

        rebatePerWallet[rebateWallet] = 1; // avoid zero to non zero storage cost

        // send rebate to rebate wallet
        (bool success, ) = rebateWallet.call{value: amountWei}("");
        require(success, "rebate transfer failed");

        emit RebatePaid(rebateWallet, ETH_TOKEN_ADDRESS, amountWei);

        return amountWei;
    }

    /// @dev claim accumulated fee per platform wallet. Called by any address
    /// @param platformWallet the wallet to claim fee for. Total accumulated fee sent to this wallet.
    /// @return amountWei amount of fee claimed
    function claimPlatformFee(address platformWallet)
        external
        override
        nonReentrant
        returns (uint256 amountWei)
    {
        require(feePerPlatformWallet[platformWallet] > 1, "no fee to claim");
        // Get total amount of fees accumulated
        amountWei = feePerPlatformWallet[platformWallet].sub(1);

        // redundant check, can't happen
        assert(totalPayoutBalance >= amountWei);
        totalPayoutBalance = totalPayoutBalance.sub(amountWei);

        feePerPlatformWallet[platformWallet] = 1; // avoid zero to non zero storage cost

        (bool success, ) = platformWallet.call{value: amountWei}("");
        require(success, "platform fee transfer failed");

        emit PlatformFeePaid(platformWallet, ETH_TOKEN_ADDRESS, amountWei);
        return amountWei;
    }

    /// @dev set nimbleDao contract address once and set setter address to zero.
    /// @param _nimbleDao nimbleDao address.
    function setDaoContract(InimbleDao _nimbleDao) external {
        require(msg.sender == daoSetter, "only daoSetter");
        require(_nimbleDao != InimbleDao(0));
        nimbleDao = _nimbleDao;
        emit nimbleDaoAddressSet(nimbleDao);

        daoSetter = address(0);
    }

    /// @dev set new nimbleNetwork address by daoOperator
    /// @param _nimbleNetwork new nimbleNetwork contract
    function setNetworkContract(address _nimbleNetwork) external onlyDaoOperator {
        require(_nimbleNetwork != address(0), "nimbleNetwork 0");
        if (_nimbleNetwork != nimbleNetwork) {
            nimbleNetwork = _nimbleNetwork;
            emit nimbleNetworkUpdated(nimbleNetwork);
        }
    }

    /// @dev Allow to set nimbleNetworkProxy address by daoOperator
    /// @param _newProxy new nimbleNetworkProxy contract
    function setnimbleProxy(InimbleProxy _newProxy) external onlyDaoOperator {
        require(_newProxy != InimbleProxy(0), "nimbleNetworkProxy 0");
        if (_newProxy != nimbleProxy) {
            nimbleProxy = _newProxy;
            emit nimbleProxyUpdated(_newProxy);
        }
    }

    /// @dev set NIM sanity rate contract and amount wei to burn
    /// @param _sanityRate new sanity rate contract
    /// @param _weiToBurn new amount of wei to burn
    function setBurnConfigParams(ISanityRate _sanityRate, uint256 _weiToBurn)
        external
        onlyDaoOperator
    {
        require(_weiToBurn > 0, "_weiToBurn is 0");

        if (sanityRateContract.length == 0 || (_sanityRate != sanityRateContract[0])) {
            // it is a new sanity rate contract
            if (sanityRateContract.length == 0) {
                sanityRateContract.push(_sanityRate);
            } else {
                sanityRateContract.push(sanityRateContract[0]);
                sanityRateContract[0] = _sanityRate;
            }
        }

        weiToBurn = _weiToBurn;

        emit BurnConfigSet(_sanityRate, _weiToBurn);
    }


    /// @dev Burn NIM. The burn amount is limited. Forces block delay between burn calls.
    /// @dev only none ontract can call this function
    /// @return NIMBurnAmount amount of NIM burned
    function burnNIM() external onlyNonContract returns (uint256 NIMBurnAmount) {
        // check if current block > last burn block number + num block interval
        require(block.number > lastBurnBlock + burnBlockInterval, "wait more blocks to burn");

        // update last burn block number
        lastBurnBlock = block.number;

        // Get amount to burn, if greater than weiToBurn, burn only weiToBurn per function call.
        uint256 balance = address(this).balance;

        // redundant check, can't happen
        assert(balance >= totalPayoutBalance);
        uint256 srcAmount = balance.sub(totalPayoutBalance);
        srcAmount = srcAmount > weiToBurn ? weiToBurn : srcAmount;

        // Get rate
        uint256 nimbleEthNIMRate = nimbleProxy.getExpectedRateAfterFee(
            ETH_TOKEN_ADDRESS,
            NIM,
            srcAmount,
            0,
            ""
        );
        validateEthToNIMRateToBurn(nimbleEthNIMRate);

        // Buy some NIM and burn
        NIMBurnAmount = nimbleProxy.swapEtherToToken{value: srcAmount}(
            NIM,
            nimbleEthNIMRate
        );

        require(IBurnableToken(address(NIM)).burn(NIMBurnAmount), "NIM burn failed");

        emit NIMBurned(NIMBurnAmount, ETH_TOKEN_ADDRESS, srcAmount);
        return NIMBurnAmount;
    }

    /// @dev if no one voted for an epoch (like epoch 0), no one gets rewards - should burn it.
    ///         Will move the epoch reward amount to burn amount. So can later be burned.
    ///         calls nimbleDao contract to check if there were any votes for this epoch.
    /// @param epoch epoch number to check.
    function makeEpochRewardBurnable(uint256 epoch) external {
        require(nimbleDao != InimbleDao(0), "nimbleDao not set");

        require(nimbleDao.shouldBurnRewardForEpoch(epoch), "should not burn reward");

        uint256 rewardAmount = rewardsPerEpoch[epoch];
        require(rewardAmount > 0, "reward is 0");

        // redundant check, can't happen
        require(totalPayoutBalance >= rewardAmount, "total reward less than epoch reward");
        totalPayoutBalance = totalPayoutBalance.sub(rewardAmount);

        rewardsPerEpoch[epoch] = 0;

        emit RewardsRemovedToBurn(epoch, rewardAmount);
    }

    /// @notice should be called off chain
    /// @dev returns list of sanity rate contracts
    /// @dev index 0 is currently used contract address, indexes > 0 are older versions
    function getSanityRateContracts() external view returns (ISanityRate[] memory sanityRates) {
        sanityRates = sanityRateContract;
    }

    /// @dev return latest NIM/eth rate from sanity rate contract
    function getLatestSanityRate() external view returns (uint256 NIMToEthSanityRate) {
        if (sanityRateContract.length > 0 && sanityRateContract[0] != ISanityRate(0)) {
            NIMToEthSanityRate = sanityRateContract[0].latestAnswer();
        } else {
            NIMToEthSanityRate = 0; 
        }
    }

    function getBRR()
        public
        returns (
            uint256 rewardBps,
            uint256 rebateBps,
            uint256 epoch
        )
    {
        uint256 expiryTimestamp;
        (rewardBps, rebateBps, expiryTimestamp, epoch) = readBRRData();

        // Check current timestamp
        if (now > expiryTimestamp && nimbleDao != InimbleDao(0)) {
            uint256 burnBps;

            (burnBps, rewardBps, rebateBps, epoch, expiryTimestamp) = nimbleDao
                .getLatestBRRDataWithCache();
            require(burnBps.add(rewardBps).add(rebateBps) == BPS, "Bad BRR values");
            
            emit BRRUpdated(rewardBps, rebateBps, burnBps, expiryTimestamp, epoch);

            // Update brrAndEpochData
            updateBRRData(rewardBps, rebateBps, expiryTimestamp, epoch);
        }
    }

    function readBRRData()
        public
        view
        returns (
            uint256 rewardBps,
            uint256 rebateBps,
            uint256 expiryTimestamp,
            uint256 epoch
        )
    {
        rewardBps = uint256(brrAndEpochData.rewardBps);
        rebateBps = uint256(brrAndEpochData.rebateBps);
        epoch = uint256(brrAndEpochData.epoch);
        expiryTimestamp = uint256(brrAndEpochData.expiryTimestamp);
    }

    function updateBRRData(
        uint256 reward,
        uint256 rebate,
        uint256 expiryTimestamp,
        uint256 epoch
    ) internal {
        // reward and rebate combined values <= BPS. Tested in getBRR.
        require(expiryTimestamp < 2**64, "expiry timestamp overflow");
        require(epoch < 2**32, "epoch overflow");

        brrAndEpochData.rewardBps = uint16(reward);
        brrAndEpochData.rebateBps = uint16(rebate);
        brrAndEpochData.expiryTimestamp = uint64(expiryTimestamp);
        brrAndEpochData.epoch = uint32(epoch);
    }

    function getRRWeiValues(uint256 RRAmountWei)
        internal
        returns (
            uint256 rewardWei,
            uint256 rebateWei,
            uint256 epoch
        )
    {
        // Decoding BRR data
        uint256 rewardInBps;
        uint256 rebateInBps;
        (rewardInBps, rebateInBps, epoch) = getBRR();

        rebateWei = RRAmountWei.mul(rebateInBps).div(BPS);
        rewardWei = RRAmountWei.mul(rewardInBps).div(BPS);
    }

    function updateRebateValues(
        uint256 rebateWei,
        address[] memory rebateWallets,
        uint256[] memory rebateBpsPerWallet
    ) internal returns (uint256 totalRebatePaidWei) {
        uint256 totalRebateBps;
        uint256 walletRebateWei;

        for (uint256 i = 0; i < rebateWallets.length; i++) {
            require(rebateWallets[i] != address(0), "rebate wallet address 0");

            walletRebateWei = rebateWei.mul(rebateBpsPerWallet[i]).div(BPS);
            rebatePerWallet[rebateWallets[i]] = rebatePerWallet[rebateWallets[i]].add(
                walletRebateWei
            );

            // a few wei could be left out due to rounding down. so count only paid wei
            totalRebatePaidWei = totalRebatePaidWei.add(walletRebateWei);
            totalRebateBps = totalRebateBps.add(rebateBpsPerWallet[i]);
        }

        require(totalRebateBps <= BPS, "rebates more then 100%");
    }

    function validateEthToNIMRateToBurn(uint256 rateEthToNIM) internal view {
        require(rateEthToNIM <= MAX_RATE, "ethToNIM rate out of bounds");
        require(rateEthToNIM > 0, "ethToNIM rate is 0");
        require(sanityRateContract.length > 0, "no sanity rate contract");
        require(sanityRateContract[0] != ISanityRate(0), "sanity rate is 0x0, burning is blocked");

        // get latest NIM/eth rate from sanity contract
        uint256 NIMToEthRate = sanityRateContract[0].latestAnswer();
        require(NIMToEthRate > 0, "sanity rate is 0");
        require(NIMToEthRate <= MAX_RATE, "sanity rate out of bounds");

        uint256 sanityEthToNIMRate = PRECISION.mul(PRECISION).div(NIMToEthRate);

        // rate shouldn't be SANITY_RATE_DIFF_BPS lower than sanity rate
        require(
            rateEthToNIM.mul(BPS) >= sanityEthToNIMRate.mul(BPS.sub(SANITY_RATE_DIFF_BPS)),
            "nimbleNetwork eth to NIM rate too low"
        );
    }
}
