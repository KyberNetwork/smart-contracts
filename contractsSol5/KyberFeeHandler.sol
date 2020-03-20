pragma solidity 0.5.11;

import "./utils/PermissionGroups2.sol";
import "./utils/Utils4.sol";
import "./IKyberDAO.sol";
import "./IKyberFeeHandler.sol";
import "./IKyberNetworkProxy.sol";
import "./IBurnableToken.sol";

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
 *              Burn: accumulated in the contract. Burned value and interval limited.
 *              Platfrom fee: accumulated per platform wallet, can be claimed any time.
 *      2. Network Fee distribtuion. per epoch Kyber fee Handler reads current distribution from Kyber DAO.
 *          Expiry block for data is set. when data expires. Fee handler reads new data from DAO.
 */

contract KyberFeeHandler is IKyberFeeHandler, Utils4 {

    uint internal constant BITS_PER_PARAM = 64;
    uint internal constant DEFAULT_REWARD_BPS = 3000;
    uint internal constant DEFAULT_REBATE_BPS = 3000;
    uint public constant   WEI_TO_BURN = 2 * 10 ** ETH_DECIMALS;

    struct BRRData {
        uint64 expiryBlock;
        uint32 epoch;
        uint16 rewardBps;
        uint16 rebateBps;
    }

    IKyberDAO public kyberDAO;
    IKyberNetworkProxy public networkProxy;
    address public kyberNetwork;
    IERC20 public KNC;

    uint public burnBlockInterval = 15;
    uint public lastBurnBlock;
    BRRData public brrAndEpochData;
    address public daoSetter;

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
            uint _burnBlockInterval
        ) public
    {
        require(address(_daoSetter) != address(0), "FeeHandler: daoSetter 0");
        require(address(_networkProxy) != address(0), "FeeHandler: KyberNetworkProxy 0");
        require(address(_kyberNetwork) != address(0), "FeeHandler: KyberNetwork 0");
        require(address(_knc) != address(0), "FeeHandler: KNC 0");
        require(_burnBlockInterval != 0, "FeeHandler: _burnBlockInterval 0");

        daoSetter = _daoSetter;
        networkProxy = _networkProxy;
        kyberNetwork = _kyberNetwork;
        KNC = _knc;
        burnBlockInterval = _burnBlockInterval;

        //start with epoch 0
        updateBRRData(DEFAULT_REWARD_BPS, DEFAULT_REBATE_BPS, block.number, 0);
    }

    event EthReceived(uint amount);

    function() external payable {
        emit EthReceived(msg.value);
    }

    modifier onlyDAO {
        require(
            msg.sender == address(kyberDAO),
            "Only DAO"
        );
        _;
    }

    modifier onlyKyberNetwork {
        require(
            msg.sender == address(kyberNetwork),
            "Only Kyber"
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
        feePerPlatformWallet[platformWallet] += platformFeeWei;

        uint feeBRR = msg.value - platformFeeWei;

        if (feeBRR == 0) {
            // only platform fee paid
            totalPayoutBalance += platformFeeWei;
            emit FeeDistributed(platformWallet, platformFeeWei, 0, 0, rebateWallets, rebateBpsPerWallet, 0);
            return true;
        }

        // Decoding BRR data
        (uint rewardWei, uint rebateWei, uint epoch) = getRRWeiValues(feeBRR);

        for (uint i = 0; i < rebateWallets.length; i++) {
            // Internal accounting for rebates per reserve wallet (rebatePerWallet)
            rebatePerWallet[rebateWallets[i]] += rebateWei * rebateBpsPerWallet[i] / BPS;
        }

        rewardsPerEpoch[epoch] += rewardWei;

        // update balance for rewards, rebates, fee
        totalPayoutBalance += (platformFeeWei + rewardWei + rebateWei);

        emit FeeDistributed(platformWallet, platformFeeWei, rewardWei, rebateWei, rebateWallets, rebateBpsPerWallet,
            (feeBRR - rewardWei - rebateWei));

        return true;
    }

    event RewardPaid(address staker, uint amountWei);

    /// @dev only Dao can call a claim to staker rewards.
    /// @param staker address.
    /// @param percentageInPrecision the relative part of the trade the staker is entitled to for this epoch.
    ///             uint Precision: 10 ** 18 = 100%
    /// @param epoch for which epoch the staker is claiming the rewerad
    function claimStakerReward(address staker, uint percentageInPrecision, uint epoch)
        external onlyDAO returns(bool)
    {
        // Amount of reward to be sent to staker
        require(percentageInPrecision <= PRECISION, "percentage high");
        uint amount = rewardsPerEpoch[epoch] * percentageInPrecision / PRECISION;

        require(totalPayoutBalance >= amount, "Amount underflow");
        require(rewardsPaidPerEpoch[epoch] + amount <= rewardsPerEpoch[epoch], "paid per epoch high");
        rewardsPaidPerEpoch[epoch] += amount;
        totalPayoutBalance -= amount;

        // send reward to staker
        (bool success, ) = staker.call.value(amount)("");
        require(success, "Transfer staker rewards failed.");

        emit RewardPaid(staker, amount);

        return true;
    }

    event RebatePaid(address rebateWallet, uint amountWei);

    /// @dev claim reabate per reserve wallet. called by any address
    /// @param rebateWallet the wallet to claim rebates for. Total accumulated rebate sent to this wallet.
    /// @return amount of rebate claimed
    function claimReserveRebate(address rebateWallet) external returns(uint) {
        require(rebatePerWallet[rebateWallet] > 1, "no rebate to claim");
        // Get total amount of rebate accumulated
        uint amount = rebatePerWallet[rebateWallet] - 1;

        require(totalPayoutBalance >= amount, "amount too high");
        totalPayoutBalance -= amount;

        rebatePerWallet[rebateWallet] = 1; // avoid zero to non zero storage cost

        // send rebate to rebate wallet
        (bool success, ) = rebateWallet.call.value(amount)("");
        require(success, "Transfer rebates failed.");

        emit RebatePaid(rebateWallet, amount);

        return amount;
    }

    event PlatformFeePaid(address platformWallet, uint amountWei);

    /// @dev claim accumulated fee per platform wallet. Called by any address
    /// @param platformWallet the wallet to claim fee for. Total accumulated fee sent to this wallet.
    /// @return amount of fee claimed
    function claimPlatformFee(address platformWallet) external returns(uint feeWei) {
        require(feePerPlatformWallet[platformWallet] > 1, "no fee to claim");
        // Get total amount of rebate accumulated
        uint amount = feePerPlatformWallet[platformWallet] - 1;

        require(totalPayoutBalance >= amount, "amount too high");
        totalPayoutBalance -= amount;

        feePerPlatformWallet[platformWallet] = 1; // avoid zero to non zero storage cost

        (bool success, ) = platformWallet.call.value(amount)("");
        require(success, "Transfer fee failed.");

        emit PlatformFeePaid(platformWallet, amount);
        return amount;
    }

    event KyberDaoAddressSet(IKyberDAO kyberDAO);

    /// @dev set dao contract address once and set setter address to zero.
    /// @param _kyberDAO Dao address.
    function setDaoContract(IKyberDAO _kyberDAO) public {
        require(msg.sender == daoSetter, "Only daoSetter");

        kyberDAO = _kyberDAO;
        emit KyberDaoAddressSet(kyberDAO);

        daoSetter = address(0);
    }

    event KNCBurned(uint KNCTWei, uint amountWei);

    /// @dev Burn knc. Burn amount limited. Forces block delay between burn calls.
    /// @return amount of KNC burned
    function burnKNC() public returns(uint) {
        // check if current block > last burn block number + num block interval
        require(block.number > lastBurnBlock + burnBlockInterval, "Wait more block to burn");

        // update last burn block number
        lastBurnBlock = block.number;

        // Get srcQty to burn, if greater than WEI_TO_BURN, burn only WEI_TO_BURN per function call.
        uint balance = address(this).balance;
        require(balance >= totalPayoutBalance, "contract balance too low");

        uint srcQty = balance - totalPayoutBalance;
        srcQty = srcQty > WEI_TO_BURN ? WEI_TO_BURN : srcQty;

        // Get rate
        uint kyberEthKncRate = networkProxy.getExpectedRateAfterFee(ETH_TOKEN_ADDRESS, KNC, srcQty, 0, "");
        uint kyberKncEthRate = networkProxy.getExpectedRateAfterFee(KNC, ETH_TOKEN_ADDRESS, srcQty, 0, "");

        require(kyberEthKncRate <= MAX_RATE && kyberKncEthRate <= MAX_RATE, "KNC rate out of bounds");
        require(kyberEthKncRate * kyberKncEthRate <= PRECISION ** 2, "internal KNC arb");
        require(kyberEthKncRate * kyberKncEthRate > PRECISION ** 2 / 2, "high KNC spread");

        // Buy some KNC and burn
        uint destQty = networkProxy.tradeWithHintAndFee.value(srcQty)(
            ETH_TOKEN_ADDRESS,
            srcQty,
            KNC,
            address(uint160(address(this))), // Convert this address into address payable
            MAX_QTY,
            kyberEthKncRate * 97 / 100,
            address(0), // platform wallet
            0, // platformFeeBps
            "" // hint
        );

        require(IBurnableToken(address(KNC)).burn(destQty), "KNC burn failed");

        emit KNCBurned(destQty, srcQty);
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

        require(totalPayoutBalance >= rewardAmount, "total reward less than epoch reward");
        totalPayoutBalance -= rewardAmount;

        rewardsPerEpoch[epoch] = 0;

        emit RewardsRemovedToBurn(epoch, rewardAmount);
    }

    function readBRRData() public view returns(uint rewardBps, uint rebateBps, uint expiryBlock, uint epoch) {
        rewardBps = uint(brrAndEpochData.rewardBps);
        rebateBps = uint(brrAndEpochData.rebateBps);
        epoch = uint(brrAndEpochData.epoch);
        expiryBlock = uint(brrAndEpochData.expiryBlock);
    }

    event BRRUpdated(uint rewardBps, uint rebateBps, uint burnBps, uint expiryBlock, uint epoch);

    function getBRR() public returns(uint rewardBps, uint rebateBps, uint epoch) {
        uint expiryBlock;
        (rewardBps, rebateBps, expiryBlock, epoch) = readBRRData();

          // Check current block number
        if (block.number > expiryBlock && kyberDAO != IKyberDAO(0)) {
            uint burnBps;

            (burnBps, rewardBps, rebateBps, epoch, expiryBlock) = kyberDAO.getLatestBRRData();
            require(burnBps + rewardBps + rebateBps == BPS, "Bad BRR values");
            require(burnBps <= BPS, "burnBps overflow");
            require(rewardBps <= BPS, "rewardBps overflow");
            require(rebateBps <= BPS, "rebateBps overflow");
            emit BRRUpdated(rewardBps, rebateBps, burnBps, expiryBlock, epoch);

            // Update brrAndEpochData
            updateBRRData(rewardBps, rebateBps, expiryBlock, epoch);
        }
    }

    function updateBRRData(uint reward, uint rebate, uint expiryBlock, uint epoch) internal {
        // reward and rebate combined values <= BPS. Tested in getBRR.
        require(expiryBlock < 2 ** 64, "expiry block overflow");
        require(epoch < 2 ** 32, "epoch overflow");

        brrAndEpochData.rewardBps = uint16(reward);
        brrAndEpochData.rebateBps = uint16(rebate);
        brrAndEpochData.expiryBlock = uint64(expiryBlock);
        brrAndEpochData.epoch = uint32(epoch);
    }

    function getRRWeiValues(uint RRAmountWei) internal
        returns(uint rewardWei, uint rebateWei, uint epoch)
    {
        // Decoding BRR data
        uint rewardInBps;
        uint rebateInBps;
        (rewardInBps, rebateInBps, epoch) = getBRR();

        rebateWei = RRAmountWei * rebateInBps / BPS;
        rewardWei = RRAmountWei * rewardInBps / BPS;
    }
}
