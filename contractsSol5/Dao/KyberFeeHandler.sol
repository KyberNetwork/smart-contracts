pragma solidity 0.5.11;

import "../utils/PermissionGroups2.sol";
import "../utils/Utils4.sol";
import "../IKyberDAO.sol";
import "../IKyberFeeHandler.sol";
import "../IKyberNetworkProxy.sol";
import "../IBurnableToken.sol";
import "./ISanityRate.sol";

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
 *          Expiry block for data is set. when data expires. Fee handler reads new data from DAO.
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

    uint internal constant BITS_PER_PARAM = 64;
    uint internal constant DEFAULT_REWARD_BPS = 3000;
    uint internal constant DEFAULT_REBATE_BPS = 3000;
    uint internal constant SANITY_RATE_DIFF_BPS = 1000; // 10%

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

    modifier onlyNoneContract {
        require(
            tx.origin == msg.sender,
            "Only none contract"
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

    struct WeiData {
        uint rebate;
        uint reward;
    }
    
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

        WeiData memory weiData;
        uint epoch;
        // Decoding BRR data
        (weiData.reward, weiData.rebate, epoch) = getRRWeiValues(feeBRR);

        uint totalRebateBps;
        for (uint i = 0; i < rebateWallets.length; i++) {
            // Internal accounting for rebates per reserve wallet (rebatePerWallet)
            rebatePerWallet[rebateWallets[i]] += weiData.rebate * rebateBpsPerWallet[i] / BPS;
            totalRebateBps += rebateBpsPerWallet[i];
        }
        require(totalRebateBps <= BPS, "Total rebates too high");

        rewardsPerEpoch[epoch] += weiData.reward;

        // update balance for rewards, rebates, fee
        totalPayoutBalance += (platformFeeWei + weiData.reward + weiData.rebate);

        emit FeeDistributed(platformWallet, platformFeeWei, weiData.reward, weiData.rebate, rebateWallets, 
            rebateBpsPerWallet, (feeBRR - weiData.reward - weiData.rebate));

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
        require(percentageInPrecision <= PRECISION, "percentage high");
        uint amount = rewardsPerEpoch[epoch] * percentageInPrecision / PRECISION;

        require(totalPayoutBalance >= amount, "Amount underflow");
        require(rewardsPaidPerEpoch[epoch] + amount <= rewardsPerEpoch[epoch], "paid per epoch high");
        rewardsPaidPerEpoch[epoch] += amount;
        totalPayoutBalance -= amount;

        // send reward to staker
        (bool success, ) = staker.call.value(amount)("");
        require(success, "Transfer staker rewards failed.");

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

    event KNCBurned(uint KNCTWei, uint amountWei);

    /// @dev Burn knc. Burn amount limited. Forces block delay between burn calls.
    /// @dev only none contract can call this function
    /// @return amount of KNC burned
    function burnKNC() public onlyNoneContract returns(uint) {
        // check if current block > last burn block number + num block interval
        require(block.number > lastBurnBlock + burnBlockInterval, "Wait more block to burn");

        // update last burn block number
        lastBurnBlock = block.number;

        // Get srcQty to burn, if greater than weiToBurn, burn only weiToBurn per function call.
        uint balance = address(this).balance;
        require(balance >= totalPayoutBalance, "contract balance too low");

        uint srcQty = balance - totalPayoutBalance;
        srcQty = srcQty > weiToBurn ? weiToBurn : srcQty;

        // Get rate
        uint kyberEthKncRate = networkProxy.getExpectedRateAfterFee(ETH_TOKEN_ADDRESS, KNC, srcQty, 0, "");

        require(validateEthToKncRateToBurn(kyberEthKncRate), "Kyber KNC rate invalid");

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

        rebateWei = RRAmountWei * rebateInBps / BPS;
        rewardWei = RRAmountWei * rewardInBps / BPS;
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

        uint sanityEthToKncRate = PRECISION * PRECISION / kncToEthRate;

        // rate shouldn't be 10% lower than sanity rate
        require(rateEthToKnc * BPS >= sanityEthToKncRate * (BPS - SANITY_RATE_DIFF_BPS), "Kyber Eth To KNC rate too low");

        return true;
    }
}
