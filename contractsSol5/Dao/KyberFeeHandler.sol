pragma solidity 0.5.11;

import "../utils/PermissionGroups2.sol";
import "../utils/Utils4.sol";
import "../IKyberDAO.sol";
import "../IKyberFeeHandler.sol";
import "../IKyberNetworkProxy.sol";
import "../IBurnableToken.sol";
import "./ISanityRate.sol";
import "../utils/zeppelin/SafeMath.sol";

/*
 * @title Kyber fee handler
 *
 * @dev Kyber fee Handler works tightly with contracts KyberNetwork and KyberDAO.
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
 *      2. Network Fee distribtuion. per epoch Kyber fee Handler reads current distribution from Kyber DAO.
 *          Expiry timestamp for data is set. when data expires. Fee handler reads new data from DAO.
 */

 contract BurnConfigPermission {

    address public burnConfigSetter;
    address public pendingBurnConfigSetter;

    constructor(address _burnConfigSetter) public {
        require(_burnConfigSetter != address(0), "burnConfigSetter is 0");
        burnConfigSetter = _burnConfigSetter;
    }

    modifier onlyBurnConfigSetter() {
        require(msg.sender == burnConfigSetter, "only burnConfigSetter");
        _;
    }

    event TransferBurnConfigSetter(address pendingBurnConfigSetter);

    /**
     * @dev Allows the current burnConfigSetter to set the pendingBurnConfigSetter address.
     * @param newSetter The address to transfer ownership to.
     */
    function transferBurnConfigSetter(address newSetter) public onlyBurnConfigSetter {
        require(newSetter != address(0), "newSetter is 0");
        emit TransferBurnConfigSetter(newSetter);
        pendingBurnConfigSetter = newSetter;
    }

    event BurnConfigSetterClaimed(address newBurnConfigSetter, address previousBurnConfigSetter);

    /**
     * @dev Allows the pendingBurnConfigSetter address to finalize the change burn config setter process.
     */
    function claimBurnConfigSetter() public {
        require(pendingBurnConfigSetter == msg.sender, "only pending burn config setter");
        emit BurnConfigSetterClaimed(pendingBurnConfigSetter, burnConfigSetter);
        burnConfigSetter = pendingBurnConfigSetter;
        pendingBurnConfigSetter = address(0);
    }
}

contract KyberFeeHandler is IKyberFeeHandler, Utils4, BurnConfigPermission {

    using SafeMath for uint;

    uint internal constant BITS_PER_PARAM = 64;
    uint internal constant DEFAULT_REWARD_BPS = 3000;
    uint internal constant DEFAULT_REBATE_BPS = 3000;
    uint internal constant SANITY_RATE_DIFF_BPS = 1000; // 10%

    struct BRRData {
        uint64 expiryTimestamp;
        uint32 epoch;
        uint16 rewardBps;
        uint16 rebateBps;
    }

    IKyberDAO public kyberDAO;
    IKyberNetworkProxy public networkProxy;
    address public kyberNetwork;
    IERC20 public knc;

    uint public burnBlockInterval = 15;
    uint public lastBurnBlock;

    BRRData public brrAndEpochData;
    address public daoSetter;

    /// @dev amount of eth to burn for each burn KNC call
    uint public weiToBurn = 2 * 10 ** ETH_DECIMALS;

    /// @dev use to get rate of KNC/ETH to check if rate to burn KNC is normal
    /// @dev index 0 is currently used contract address, indexes > 0 are older versions
    ISanityRate[] internal sanityRateContract;

    mapping(address => uint) public feePerPlatformWallet;
    mapping(address => uint) public rebatePerWallet;
    mapping(uint => uint) public rewardsPerEpoch;
    mapping(uint => uint) public rewardsPaidPerEpoch;
    uint public totalPayoutBalance; // total balance in the contract that is for rebate, reward, platform fee

    constructor(
            address _daoSetter,
            IKyberNetworkProxy _networkProxy,
            address _kyberNetwork,
            IERC20 _knc,
            uint _burnBlockInterval,
            address _burnConfigSetter
        ) BurnConfigPermission(_burnConfigSetter) public
    {
        require(address(_daoSetter) != address(0), "daoSetter 0");
        require(address(_networkProxy) != address(0), "KyberNetworkProxy 0");
        require(address(_kyberNetwork) != address(0), "KyberNetwork 0");
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

    event EthReceived(uint amount);

    function() external payable {
        emit EthReceived(msg.value);
    }

    modifier onlyDAO {
        require(
            msg.sender == address(kyberDAO),
            "only DAO"
        );
        _;
    }

    modifier onlyKyberNetwork {
        require(
            msg.sender == address(kyberNetwork),
            "only Kyber"
        );
        _;
    }

    modifier onlyNonContract {
        require(
            tx.origin == msg.sender,
            "only non-contract"
        );
        _;
    }

    event FeeDistributed(
        address platformWallet,
        uint platformFeeWei,
        uint rewardWei,
        uint rebateWei,
        address[] rebateWallets,
        uint[] rebatePercentBpsPerWallet,
        uint burnAmtWei
    );

/// @dev handleFees function is called per trade on KyberNetwork. unless the trade is not involving any fees.
/// @param rebateWallets a list of rebate wallets that are entitiled for fee with this trade.
/// @param rebateBpsPerWallet percentage of rebate for each wallet, out of total rebate. BPS uints: 10000 = 100%
/// @param platformWallet Wallet address that is entitled to platfrom fee.
/// @param platformFeeWei Fee amount in wei the platfrom wallet is entitled to.
    function handleFees(address[] calldata rebateWallets, uint[] calldata rebateBpsPerWallet,
        address platformWallet, uint platformFeeWei)
        external payable onlyKyberNetwork returns(bool)
    {
        require(msg.value >= platformFeeWei, "msg.value low");

        // handle platform fee
        feePerPlatformWallet[platformWallet] = feePerPlatformWallet[platformWallet].add(platformFeeWei);

        uint feeBRRWei = msg.value.sub(platformFeeWei);

        if (feeBRRWei == 0) {
            // only platform fee paid
            totalPayoutBalance = totalPayoutBalance.add(platformFeeWei);
            emit FeeDistributed(platformWallet, platformFeeWei, 0, 0, rebateWallets, rebateBpsPerWallet, 0);
            return true;
        }

        uint rebateWei;
        uint rewardWei;
        uint epoch;

        // Decoding BRR data
        (rewardWei, rebateWei, epoch) = getRRWeiValues(feeBRRWei);

        rebateWei = updateRebateValues(rebateWei, rebateWallets, rebateBpsPerWallet);

        rewardsPerEpoch[epoch] = rewardsPerEpoch[epoch].add(rewardWei);

        // update balance for rewards, rebates, fee
        totalPayoutBalance = totalPayoutBalance.add(platformFeeWei).add(rewardWei).add(rebateWei);

        // avoid stack too deep, compute burnWei and save to feeBRRWei
        feeBRRWei = feeBRRWei.sub(rewardWei).sub(rebateWei);
        emit FeeDistributed(platformWallet, platformFeeWei, rewardWei, rebateWei, rebateWallets, rebateBpsPerWallet,
            feeBRRWei);

        return true;
    }

    event RewardPaid(address staker, uint epoch, uint amountWei);

    /// @dev only Dao can call a claim to staker rewards.
    /// @param staker address.
    /// @param percentageInPrecision the relative part of the trade the staker is entitled to for this epoch.
    ///             uint Precision: 10 ** 18 = 100%
    /// @param epoch for which epoch the staker is claiming the rewerad
    function claimStakerReward(address staker, uint percentageInPrecision, uint epoch)
        external onlyDAO returns(bool)
    {
        // Amount of reward to be sent to staker
        require(percentageInPrecision <= PRECISION, "percentage too high");
        uint amount = rewardsPerEpoch[epoch].mul(percentageInPrecision).div(PRECISION);

        // redundant check, but better revert message
        require(totalPayoutBalance >= amount, "staker reward too high");
        require(rewardsPaidPerEpoch[epoch].add(amount) <= rewardsPerEpoch[epoch], "reward paid per epoch too high");
        rewardsPaidPerEpoch[epoch] = rewardsPaidPerEpoch[epoch].add(amount);
        totalPayoutBalance = totalPayoutBalance.sub(amount);

        // send reward to staker
        (bool success, ) = staker.call.value(amount)("");
        require(success, "staker rewards transfer failed");

        emit RewardPaid(staker, epoch, amount);

        return true;
    }

    event RebatePaid(address rebateWallet, uint amountWei);

    /// @dev claim reabate per reserve wallet. called by any address
    /// @param rebateWallet the wallet to claim rebates for. Total accumulated rebate sent to this wallet.
    /// @return amount of rebate claimed
    function claimReserveRebate(address rebateWallet) external returns(uint) {
        require(rebatePerWallet[rebateWallet] > 1, "no rebate to claim");
        // Get total amount of rebate accumulated
        uint amount = rebatePerWallet[rebateWallet].sub(1);

        // redundant check, but better revert message
        require(totalPayoutBalance >= amount, "rebate amount too high");
        totalPayoutBalance = totalPayoutBalance.sub(amount);

        rebatePerWallet[rebateWallet] = 1; // avoid zero to non zero storage cost

        // send rebate to rebate wallet
        (bool success, ) = rebateWallet.call.value(amount)("");
        require(success, "rebate transfer failed");

        emit RebatePaid(rebateWallet, amount);

        return amount;
    }

    event PlatformFeePaid(address platformWallet, uint amountWei);

    /// @dev claim accumulated fee per platform wallet. Called by any address
    /// @param platformWallet the wallet to claim fee for. Total accumulated fee sent to this wallet.
    /// @return amount of fee claimed
    function claimPlatformFee(address platformWallet) external returns(uint feeWei) {
        require(feePerPlatformWallet[platformWallet] > 1, "no fee to claim");
        // Get total amount of fees accumulated
        uint amount = feePerPlatformWallet[platformWallet].sub(1);

        // redundant check, but better revert message
        require(totalPayoutBalance >= amount, "platform fee amount too high");
        totalPayoutBalance = totalPayoutBalance.sub(amount);

        feePerPlatformWallet[platformWallet] = 1; // avoid zero to non zero storage cost

        (bool success, ) = platformWallet.call.value(amount)("");
        require(success, "platform fee transfer failed");

        emit PlatformFeePaid(platformWallet, amount);
        return amount;
    }

    event KyberDaoAddressSet(IKyberDAO kyberDAO);

    /// @dev set dao contract address once and set setter address to zero.
    /// @param _kyberDAO Dao address.
    function setDaoContract(IKyberDAO _kyberDAO) public {
        require(msg.sender == daoSetter, "only daoSetter");

        kyberDAO = _kyberDAO;
        emit KyberDaoAddressSet(kyberDAO);

        daoSetter = address(0);
    }

    event BurnConfigSet(ISanityRate sanityRate, uint weiToBurn);

    /// @dev set burn KNC sanity rate contract and amount wei to burn
    /// @param _sanityRate new sanity rate contract
    /// @param _weiToBurn new amount of wei to burn
    function setBurnConfigParams(ISanityRate _sanityRate, uint _weiToBurn)
        public onlyBurnConfigSetter
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

    event KncBurned(uint kncTWei, uint amountWei);

    /// @dev Burn knc. Burn amount limited. Forces block delay between burn calls.
    /// @dev only none contract can call this function
    /// @return amount of KNC burned
    function burnKnc() public onlyNonContract returns(uint) {
        // check if current block > last burn block number + num block interval
        require(block.number > lastBurnBlock + burnBlockInterval, "wait more blocks to burn");

        // update last burn block number
        lastBurnBlock = block.number;

        // Get srcQty to burn, if greater than weiToBurn, burn only weiToBurn per function call.
        uint balance = address(this).balance;

        // redundant check, but better revert message
        require(balance >= totalPayoutBalance, "contract balance too low");
        uint srcQty = balance.sub(totalPayoutBalance);
        srcQty = srcQty > weiToBurn ? weiToBurn : srcQty;

        // Get rate
        uint kyberEthKncRate = networkProxy.getExpectedRateAfterFee(ETH_TOKEN_ADDRESS, knc, srcQty, 0, "");

        require(validateEthToKncRateToBurn(kyberEthKncRate), "Kyber knc rate invalid");

        // Buy some KNC and burn
        uint destQty = networkProxy.tradeWithHintAndFee.value(srcQty)(
            ETH_TOKEN_ADDRESS,
            srcQty,
            knc,
            address(uint160(address(this))), // Convert this address into address payable
            MAX_QTY,
            kyberEthKncRate,
            address(0), // platform wallet
            0, // platformFeeBps
            "" // hint
        );

        require(IBurnableToken(address(knc)).burn(destQty), "knc burn failed");

        emit KncBurned(destQty, srcQty);
        return destQty;
    }

    event RewardsRemovedToBurn(uint epoch, uint rewardsWei);

    /// @dev if no one voted for an epoch (like epoch 0). no one gets rewards. so should reward amount.
    ///         call DAO contract to check if for this epoch any votes occured.
    /// @param epoch epoch number to check if should burn accumulated rewards.
    function shouldBurnEpochReward(uint epoch) public {
        require(address(kyberDAO) != address(0), "kyberDAO addr missing");

        require(kyberDAO.shouldBurnRewardForEpoch(epoch), "should not burn reward");

        uint rewardAmount = rewardsPerEpoch[epoch];
        require(rewardAmount > 0, "reward is 0");

        // redundant check, but better revert message
        require(totalPayoutBalance >= rewardAmount, "total reward less than epoch reward");
        totalPayoutBalance = totalPayoutBalance.sub(rewardAmount);

        rewardsPerEpoch[epoch] = 0;

        emit RewardsRemovedToBurn(epoch, rewardAmount);
    }

    function readBRRData() public view returns(uint rewardBps, uint rebateBps, uint expiryTimestamp, uint epoch) {
        rewardBps = uint(brrAndEpochData.rewardBps);
        rebateBps = uint(brrAndEpochData.rebateBps);
        epoch = uint(brrAndEpochData.epoch);
        expiryTimestamp = uint(brrAndEpochData.expiryTimestamp);
    }

    event BRRUpdated(uint rewardBps, uint rebateBps, uint burnBps, uint expiryTimestamp, uint epoch);

    function getBRR() public returns(uint rewardBps, uint rebateBps, uint epoch) {
        uint expiryTimestamp;
        (rewardBps, rebateBps, expiryTimestamp, epoch) = readBRRData();

          // Check current block number
        if (now > expiryTimestamp && kyberDAO != IKyberDAO(0)) {
            uint burnBps;

            (burnBps, rewardBps, rebateBps, epoch, expiryTimestamp) = kyberDAO.getLatestBRRData();
            require(burnBps + rewardBps + rebateBps == BPS, "Bad BRR values");
            require(burnBps <= BPS, "burnBps overflow");
            require(rewardBps <= BPS, "rewardBps overflow");
            require(rebateBps <= BPS, "rebateBps overflow");
            emit BRRUpdated(rewardBps, rebateBps, burnBps, expiryTimestamp, epoch);

            // Update brrAndEpochData
            updateBRRData(rewardBps, rebateBps, expiryTimestamp, epoch);
        }
    }

    function updateBRRData(uint reward, uint rebate, uint expiryTimestamp, uint epoch) internal {
        // reward and rebate combined values <= BPS. Tested in getBRR.
        require(expiryTimestamp < 2 ** 64, "expiry timestamp overflow");
        require(epoch < 2 ** 32, "epoch overflow");

        brrAndEpochData.rewardBps = uint16(reward);
        brrAndEpochData.rebateBps = uint16(rebate);
        brrAndEpochData.expiryTimestamp = uint64(expiryTimestamp);
        brrAndEpochData.epoch = uint32(epoch);
    }

    /// @notice should be called off chain
    /// @dev returns list of sanity rate contracts
    /// @dev index 0 is currently used contract address, indexes > 0 are older versions
    function getSanityRateContracts() external view returns (ISanityRate[] memory sanityRates) {
       sanityRates = sanityRateContract;
    }

    /// @dev return latest knc/eth rate from sanity rate contract
    function getLatestSanityRate() external view returns(uint kncToEthSanityRate) {
        if (sanityRateContract.length > 0 && sanityRateContract[0] != ISanityRate(0)) {
            kncToEthSanityRate = sanityRateContract[0].latestAnswer();
        }
    }

    function getRRWeiValues(uint RRAmountWei) internal
        returns(uint rewardWei, uint rebateWei, uint epoch)
    {
        // Decoding BRR data
        uint rewardInBps;
        uint rebateInBps;
        (rewardInBps, rebateInBps, epoch) = getBRR();

        rebateWei = RRAmountWei.mul(rebateInBps).div(BPS);
        rewardWei = RRAmountWei.mul(rewardInBps).div(BPS);
    }

    function validateEthToKncRateToBurn(uint rateEthToKnc) internal view returns(bool) {
        require(rateEthToKnc <= MAX_RATE, "ethToKnc rate out of bounds");
        require(rateEthToKnc > 0, "ethToKnc rate is 0");
        require(sanityRateContract.length > 0, "no sanity rate contract");
        require(sanityRateContract[0] != ISanityRate(0), "sanity rate is 0x0, burning is blocked");

        // get latest knc/eth rate from sanity contract
        uint kncToEthRate = sanityRateContract[0].latestAnswer();
        require(kncToEthRate > 0, "sanity rate is 0");
        require(kncToEthRate <= MAX_RATE, "sanity rate out of bounds");

        uint sanityEthToKncRate = PRECISION.mul(PRECISION).div(kncToEthRate);

        // rate shouldn't be 10% lower than sanity rate
        require(rateEthToKnc.mul(BPS) >= sanityEthToKncRate.mul(BPS.sub(SANITY_RATE_DIFF_BPS)), "Kyber eth to knc rate too low");

        return true;
    }

    function updateRebateValues(uint rebateWei, address[] memory rebateWallets, uint[] memory rebateBpsPerWallet)
        internal returns (uint totalRebatePaidWei)
    {

        uint totalRebateBps;
        uint walletRebateWei;

        for (uint i = 0; i < rebateWallets.length; i++) {
            require(rebateWallets[i] != address(0), "rebate wallet address 0");

            walletRebateWei = rebateWei.mul(rebateBpsPerWallet[i]).div(BPS);
            rebatePerWallet[rebateWallets[i]] = rebatePerWallet[rebateWallets[i]].add(walletRebateWei);

            // a few wei could be left out due to rounding down. so count only paid wei
            totalRebatePaidWei = totalRebatePaidWei.add(walletRebateWei);
            totalRebateBps = totalRebateBps.add(rebateBpsPerWallet[i]);
        }

        require(totalRebateBps <= BPS, "rebates more then 100%");
    }
}
