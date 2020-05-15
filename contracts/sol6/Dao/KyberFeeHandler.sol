pragma solidity 0.6.6;

import "../utils/Utils5.sol";
import "../IKyberDAO.sol";
import "./DaoOperator.sol";
import "../IKyberFeeHandler.sol";
import "../IKyberNetworkProxy.sol";
import "../ISimpleKyberProxy.sol";
import "../IBurnableToken.sol";
import "./ISanityRate.sol";
import "../utils/zeppelin/SafeMath.sol";


/**
 * @title Kyber fee handler
 *
 * @dev Kyber fee Handler works tightly with contracts KyberNetwork and KyberDAO.
 *      Some events are moved to interface, easier for public uses
 * @dev Terminology:
 *          Epoch - DAO Voting campaign time frame.
 *              Kyber DAO voting campaigns have pre defined time period defined in number of blocks.
 *          BRR - Burn / Reward / Rebate. Kyber network fee is used for 3 purposes:
 *              Burning KNC
 *              Reward addresse that stake KNC in KyberStaking contract. AKA - stakers
 *              Rebate reserves for supporting trades.
 * @dev Code flow:
 *      1. Accumulating && claiming Fees. Per trade on KyberNetwork, it calls handleFees() function which
 *          internally accounts for network & platform fees from the trade. Fee distribution:
 *              rewards: accumulated per epoch. can be claimed by the DAO after epoch is concluded.
 *              rebates: accumulated per rebate wallet, can be claimed any time.
 *              Burn: accumulated in the contract. Burned value and interval limited with safe check using sanity rate
 *              Platfrom fee: accumulated per platform wallet, can be claimed any time.
 *      2. Network Fee distribution. per epoch Kyber fee Handler reads current distribution from Kyber DAO.
 *          Expiry timestamp for data is set. when data expires. Fee handler reads new data from DAO.
 */

interface IKyberProxy is IKyberNetworkProxy, ISimpleKyberProxy {
    function kyberNetwork() external view returns (address);
}

contract KyberFeeHandler is IKyberFeeHandler, DaoOperator, Utils5 {
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

    IKyberDAO public kyberDAO;
    IKyberProxy public networkProxy;
    address public kyberNetwork;
    IERC20 public knc;

    uint256 public burnBlockInterval = 15;
    uint256 public lastBurnBlock;

    BRRData public brrAndEpochData;
    address public daoSetter;

    /// @dev amount of eth to burn for each burn KNC call
    uint256 public weiToBurn = 2 * 10**ETH_DECIMALS;

    mapping(address => uint256) public feePerPlatformWallet;
    mapping(address => uint256) public rebatePerWallet;
    mapping(uint256 => uint256) public rewardsPerEpoch;
    mapping(uint256 => uint256) public rewardsPaidPerEpoch;
    uint256 public totalPayoutBalance; // total balance in the contract that is for rebate, reward, platform fee

    /// @dev use to get rate of KNC/ETH to check if rate to burn KNC is normal
    /// @dev index 0 is currently used contract address, indexes > 0 are older versions
    ISanityRate[] internal sanityRateContract;

    event FeeDistributed(
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
    event KyberDaoAddressSet(IKyberDAO kyberDAO);
    event BurnConfigSet(ISanityRate sanityRate, uint256 weiToBurn);
    event RewardsRemovedToBurn(uint256 indexed epoch, uint256 rewardsWei);
    event KyberNetworkUpdated(address kyberNetwork);
    event KyberProxyUpdated(IKyberProxy kyberProxy);

    constructor(
        address _daoSetter,
        IKyberProxy _networkProxy,
        address _kyberNetwork,
        IERC20 _knc,
        uint256 _burnBlockInterval,
        address _daoOperator
    ) public DaoOperator(_daoOperator) {
        require(_daoSetter != address(0), "daoSetter 0");
        require(address(_networkProxy) != address(0), "KyberNetworkProxy 0");
        require(_kyberNetwork != address(0), "KyberNetwork 0");
        require(address(_knc) != address(0), "knc 0");
        require(_burnBlockInterval != 0, "_burnBlockInterval 0");

        daoSetter = _daoSetter;
        networkProxy = _networkProxy;
        kyberNetwork = _kyberNetwork;
        knc = _knc;
        burnBlockInterval = _burnBlockInterval;

        //start with epoch 0
        updateBRRData(DEFAULT_REWARD_BPS, DEFAULT_REBATE_BPS, now, 0);
    }

    modifier onlyDAO {
        require(msg.sender == address(kyberDAO), "only DAO");
        _;
    }

    modifier onlyKyberNetwork {
        require(msg.sender == address(kyberNetwork), "only Kyber");
        _;
    }

    modifier onlyNonContract {
        require(tx.origin == msg.sender, "only non-contract");
        _;
    }

    receive() external payable {
        emit EthReceived(msg.value);
    }

    /// @dev handleFees function is called per trade on KyberNetwork. unless the trade is not involving any fees.
    /// @param rebateWallets a list of rebate wallets that will get rebate for this trade.
    /// @param rebateBpsPerWallet percentage of rebate for each wallet, out of total rebate.
    /// @param platformWallet Wallet address that will receive the platfrom fee.
    /// @param platformFeeWei Fee amount in wei the platfrom wallet is entitled to.
    function handleFees(
        address[] calldata rebateWallets,
        uint256[] calldata rebateBpsPerWallet,
        address platformWallet,
        uint256 platformFeeWei
    ) external payable override onlyKyberNetwork {
        require(msg.value >= platformFeeWei, "msg.value low");

        // handle platform fee
        feePerPlatformWallet[platformWallet] = feePerPlatformWallet[platformWallet].add(
            platformFeeWei
        );

        uint256 feeBRRWei = msg.value.sub(platformFeeWei);

        if (feeBRRWei == 0) {
            // only platform fee paid
            totalPayoutBalance = totalPayoutBalance.add(platformFeeWei);
            emit FeeDistributed(
                platformWallet,
                platformFeeWei,
                0,
                0,
                rebateWallets,
                rebateBpsPerWallet,
                0
            );
            return;
        }

        uint256 rebateWei;
        uint256 rewardWei;
        uint256 epoch;

        // Decoding BRR data
        (rewardWei, rebateWei, epoch) = getRRWeiValues(feeBRRWei);

        rebateWei = updateRebateValues(rebateWei, rebateWallets, rebateBpsPerWallet);

        rewardsPerEpoch[epoch] = rewardsPerEpoch[epoch].add(rewardWei);

        // update balance for rewards, rebates, fee
        totalPayoutBalance = totalPayoutBalance.add(platformFeeWei).add(rewardWei).add(rebateWei);

        // avoid stack too deep, compute burnWei and save to feeBRRWei
        feeBRRWei = feeBRRWei.sub(rewardWei).sub(rebateWei);
        emit FeeDistributed(
            platformWallet,
            platformFeeWei,
            rewardWei,
            rebateWei,
            rebateWallets,
            rebateBpsPerWallet,
            feeBRRWei
        );

    }

    /// @dev only Dao can claim staker rewards.
    /// @param staker address.
    /// @param percentageInPrecision the relative part of the trade the staker is entitled to for this epoch.
    ///             uint Precision: 10 ** 18 = 100%
    /// @param epoch for which epoch the staker is claiming the reward
    function claimStakerReward(
        address staker,
        uint256 percentageInPrecision,
        uint256 epoch
    ) external override onlyDAO {
        // Amount of reward to be sent to staker
        require(percentageInPrecision <= PRECISION, "percentage too high");
        uint256 amount = rewardsPerEpoch[epoch].mul(percentageInPrecision).div(PRECISION);

        // redundant check, but better revert message
        require(totalPayoutBalance >= amount, "staker reward too high");
        require(
            rewardsPaidPerEpoch[epoch].add(amount) <= rewardsPerEpoch[epoch],
            "reward paid per epoch too high"
        );
        rewardsPaidPerEpoch[epoch] = rewardsPaidPerEpoch[epoch].add(amount);
        totalPayoutBalance = totalPayoutBalance.sub(amount);

        // send reward to staker
        (bool success, ) = staker.call{value: amount}("");
        require(success, "staker rewards transfer failed");

        emit RewardPaid(staker, epoch, amount);
    }

    /// @dev claim reabate per reserve wallet. called by any address
    /// @param rebateWallet the wallet to claim rebates for. Total accumulated rebate sent to this wallet.
    /// @return amount of rebate claimed
    function claimReserveRebate(address rebateWallet) external override returns (uint256) {
        require(rebatePerWallet[rebateWallet] > 1, "no rebate to claim");
        // Get total amount of rebate accumulated
        uint256 amount = rebatePerWallet[rebateWallet].sub(1);

        // redundant check, but better revert message
        require(totalPayoutBalance >= amount, "rebate amount too high");
        totalPayoutBalance = totalPayoutBalance.sub(amount);

        rebatePerWallet[rebateWallet] = 1; // avoid zero to non zero storage cost

        // send rebate to rebate wallet
        (bool success, ) = rebateWallet.call{value: amount}("");
        require(success, "rebate transfer failed");

        emit RebatePaid(rebateWallet, amount);

        return amount;
    }

    /// @dev claim accumulated fee per platform wallet. Called by any address
    /// @param platformWallet the wallet to claim fee for. Total accumulated fee sent to this wallet.
    /// @return feeWei amount of fee claimed
    function claimPlatformFee(address platformWallet) external returns (uint256 feeWei) {
        require(feePerPlatformWallet[platformWallet] > 1, "no fee to claim");
        // Get total amount of fees accumulated
        uint256 amount = feePerPlatformWallet[platformWallet].sub(1);

        // redundant check, but better revert message
        require(totalPayoutBalance >= amount, "platform fee amount too high");
        totalPayoutBalance = totalPayoutBalance.sub(amount);

        feePerPlatformWallet[platformWallet] = 1; // avoid zero to non zero storage cost

        (bool success, ) = platformWallet.call{value: amount}("");
        require(success, "platform fee transfer failed");

        emit PlatformFeePaid(platformWallet, amount);
        return amount;
    }

    /// @dev set dao contract address once and set setter address to zero.
    /// @param _kyberDAO Dao address.
    function setDaoContract(IKyberDAO _kyberDAO) external {
        require(msg.sender == daoSetter, "only daoSetter");

        kyberDAO = _kyberDAO;
        emit KyberDaoAddressSet(kyberDAO);

        daoSetter = address(0);
    }

    /// @dev set new kyber network address
    function setNetworkContract(address _kyberNetwork) external onlyDaoOperator {
        require(_kyberNetwork != address(0), "KyberNetwork 0");
        if (_kyberNetwork != kyberNetwork) {
            kyberNetwork = _kyberNetwork;
            emit KyberNetworkUpdated(kyberNetwork);
        }
    }

    /// @dev set burn KNC sanity rate contract and amount wei to burn
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

    /// @dev Allow to set network proxy address by using DAO operator
    /// @param _newProxy new Kyber Proxy contract
    function setNetworkProxy(IKyberProxy _newProxy) external onlyDaoOperator {
        require(_newProxy != IKyberProxy(0), "new proxy is 0");
        if (_newProxy != networkProxy) {
            networkProxy = _newProxy;
            emit KyberProxyUpdated(_newProxy);
        }
    }

    /// @dev Burn knc. Burn amount limited. Forces block delay between burn calls.
    /// @dev only none contract can call this function
    /// @return amount of KNC burned
    function burnKnc() external onlyNonContract returns (uint256) {
        // check if current block > last burn block number + num block interval
        require(block.number > lastBurnBlock + burnBlockInterval, "wait more blocks to burn");

        // update last burn block number
        lastBurnBlock = block.number;

        // Get srcQty to burn, if greater than weiToBurn, burn only weiToBurn per function call.
        uint256 balance = address(this).balance;

        // redundant check, but better revert message
        require(balance >= totalPayoutBalance, "contract balance too low");
        uint256 srcQty = balance.sub(totalPayoutBalance);
        srcQty = srcQty > weiToBurn ? weiToBurn : srcQty;

        // Get rate
        uint256 kyberEthKncRate = networkProxy.getExpectedRateAfterFee(
            ETH_TOKEN_ADDRESS,
            knc,
            srcQty,
            0,
            ""
        );
        validateEthToKncRateToBurn(kyberEthKncRate);

        // Buy some KNC and burn
        uint256 destQty = networkProxy.swapEtherToToken{value: srcQty}(
            knc,
            kyberEthKncRate
        );

        require(IBurnableToken(address(knc)).burn(destQty), "knc burn failed");

        emit KncBurned(destQty, srcQty);
        return destQty;
    }

    /// @dev if no one voted for an epoch (like epoch 0). no one gets rewards. so should reward amount.
    ///         call DAO contract to check if for this epoch any votes occured.
    /// @param epoch epoch number to check if should burn accumulated rewards.
    function shouldBurnEpochReward(uint256 epoch) external {
        require(address(kyberDAO) != address(0), "kyberDAO addr missing");

        require(kyberDAO.shouldBurnRewardForEpoch(epoch), "should not burn reward");

        uint256 rewardAmount = rewardsPerEpoch[epoch];
        require(rewardAmount > 0, "reward is 0");

        // redundant check, but better revert message
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

    /// @dev return latest knc/eth rate from sanity rate contract
    function getLatestSanityRate() external view returns (uint256 kncToEthSanityRate) {
        if (sanityRateContract.length > 0 && sanityRateContract[0] != ISanityRate(0)) {
            kncToEthSanityRate = sanityRateContract[0].latestAnswer();
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
        if (now > expiryTimestamp && kyberDAO != IKyberDAO(0)) {
            uint256 burnBps;

            (burnBps, rewardBps, rebateBps, epoch, expiryTimestamp) = kyberDAO
                .getLatestBRRDataWithCache();
            require(burnBps + rewardBps + rebateBps == BPS, "Bad BRR values");
            require(burnBps <= BPS, "burnBps overflow");
            require(rewardBps <= BPS, "rewardBps overflow");
            require(rebateBps <= BPS, "rebateBps overflow");
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

    function validateEthToKncRateToBurn(uint256 rateEthToKnc) internal view {
        require(rateEthToKnc <= MAX_RATE, "ethToKnc rate out of bounds");
        require(rateEthToKnc > 0, "ethToKnc rate is 0");
        require(sanityRateContract.length > 0, "no sanity rate contract");
        require(sanityRateContract[0] != ISanityRate(0), "sanity rate is 0x0, burning is blocked");

        // get latest knc/eth rate from sanity contract
        uint256 kncToEthRate = sanityRateContract[0].latestAnswer();
        require(kncToEthRate > 0, "sanity rate is 0");
        require(kncToEthRate <= MAX_RATE, "sanity rate out of bounds");

        uint256 sanityEthToKncRate = PRECISION.mul(PRECISION).div(kncToEthRate);

        // rate shouldn't be 10% lower than sanity rate
        require(
            rateEthToKnc.mul(BPS) >= sanityEthToKncRate.mul(BPS.sub(SANITY_RATE_DIFF_BPS)),
            "Kyber eth to knc rate too low"
        );
    }
}
