pragma solidity 0.5.11;

import "./IKyberDAO.sol";
import "./IFeeHandler.sol";
import "./PermissionGroupsV5.sol";
import "./IKyberNetworkProxy.sol";
import "./UtilsV5.sol";
import "./IBurnableToken.sol";
import "./IERC20.sol";

contract FeeHandler is IFeeHandler, Utils {

    uint constant public WEI_TO_BURN = 2 * 10 ** ETH_DECIMALS;
    uint constant BITS_PER_PARAM = 64;
    uint constant DEFAULT_REWARD_BPS = 3000;
    uint constant DEFAULT_REBATE_BPS = 3000;

    IKyberDAO public kyberDAO;
    IKyberNetworkProxy public networkProxy;
    address public kyberNetwork;
    IERC20 public KNC;
    
    uint public burnBlockInterval = 15;
    uint public lastBurnBlock;
    uint public brrAndEpochData;
    address public daoSetter;

    mapping(address => uint) public rebatePerWallet;
    mapping(uint => uint) public rewardsPerEpoch;
    mapping(uint => uint) public rewardsPayedPerEpoch;
    uint public totalValues; // total rebates, total rewards

    constructor(
        address _daoSetter,
        IKyberNetworkProxy _networkProxy,
        address _kyberNetwork,
        IERC20 _KNC,
        uint _burnBlockInterval
    ) public
    {
        require(address(_daoSetter) != address(0), "FeeHandler: daoSetter 0");
        require(address(_networkProxy) != address(0), "FeeHandler: KyberNetworkProxy 0");
        require(address(_kyberNetwork) != address(0), "FeeHandler: KyberNetwork 0");
        require(address(_KNC) != address(0), "FeeHandler: KNC 0");
        require(_burnBlockInterval != 0, "FeeHandler: _burnBlockInterval 0");

        daoSetter = _daoSetter;
        networkProxy = _networkProxy;
        kyberNetwork = _kyberNetwork;
        KNC = _KNC;
        burnBlockInterval = _burnBlockInterval;

        //start with epoch 0
        brrAndEpochData = encodeBRRData(DEFAULT_REWARD_BPS, DEFAULT_REBATE_BPS, 0, block.number);
    }

    event EthRecieved(uint amount);
    function() external payable {
        emit EthRecieved(msg.value);
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
            "Only the internal KyberNetwork can call this function."
        );
        _;
    }

    event AccumulateReserveRebate(
        address[] eligibleWallets,
        uint[] rebatePercentBps,
        uint totalRebateAmtWei,
        uint totalRewardAmtWei,
        uint totalBurnAmtWei
    );

    // Todo: consider optimize to accumulate rebates is same wallet twice
    function handleFees(address[] calldata eligibleWallets, uint[] calldata rebatePercentBps) external payable onlyKyberNetwork returns(bool) {
        require (eligibleWallets.length > 0, "no rebate wallet");

        // Decoding BRR data
        (uint rewardInBPS, uint rebateInBPS, uint epoch) = getBRR();

        uint fee = msg.value;

        uint rebateWei = rebateInBPS * fee / BPS;
        uint rewardWei = rewardInBPS * fee / BPS;
        for (uint i = 0; i < eligibleWallets.length; i ++) {
            // Internal accounting for rebates per reserve wallet (rebatePerWallet)
            rebatePerWallet[eligibleWallets[i]] += rebateWei * rebatePercentBps[i] / BPS;
        }

        (uint totalRewards , uint totalRebates) = decodeTotalValues(totalValues);
        // Internal accounting for total rebates (totalRebates)
        totalRebates += rebateWei;
        // Internal accounting for reward per epoch (rewardsPerEpoch)
        rewardsPerEpoch[epoch] += rewardWei;
        // Internal accounting for total rewards (totalRewards)
        totalRewards += rewardWei;

        totalValues = encodeTotalValues(totalRewards, totalRebates);

        emit AccumulateReserveRebate(eligibleWallets, rebatePercentBps, rebateWei, rewardWei, fee - rebateWei - rewardWei);

        return true;
    }

    event DistributeRewards(address staker, uint amountWei);

    function claimStakerReward(address staker, uint percentageInPrecision, uint epoch) 
        external onlyDAO returns(bool) 
    {
        // Amount of reward to be sent to staker
        require(percentageInPrecision <= PRECISION, "percentage high");
        uint amount = rewardsPerEpoch[epoch] * percentageInPrecision / PRECISION;

        // Update total rewards and total rewards per epoch
        (uint totalRewards , uint totalRebates) = decodeTotalValues(totalValues);
        require(totalRewards >= amount, "Amount underflow");

        require(rewardsPayedPerEpoch[epoch] + amount <= rewardsPerEpoch[epoch], "payed per epoch high");
        rewardsPayedPerEpoch[epoch] += amount;
        totalRewards -= amount;

        totalValues = encodeTotalValues(totalRewards, totalRebates);
        // send reward to staker
        (bool success, ) = staker.call.value(amount)("");
        require(success, "Transfer of rewards to staker failed.");

        emit DistributeRewards(staker, amount);

        return true;
    }

    event DistributeRebate(address rebateWallet, uint amountWei);

    // Using rebateWallet instead of reserve so I don't have to store KyberNetwork variable.
    function claimReserveRebate(address rebateWallet) external returns (uint){
        require(rebatePerWallet[rebateWallet] > 1, "no rebate to claim");
        // Get total amount of rebate accumulated
        uint amount = rebatePerWallet[rebateWallet] - 1;

        (uint totalRewards , uint totalRebates) = decodeTotalValues(totalValues);

        require(totalRebates >= amount, "amount too high");

        // Update total rebate and rebate per rebate wallet amounts
        totalRebates -= amount;
        rebatePerWallet[rebateWallet] = 1; // avoid zero to non zero storage cost

        totalValues = encodeTotalValues(totalRewards, totalRebates);
        
        // send rebate to rebate wallet
        (bool success, ) = rebateWallet.call.value(amount)("");
        require(success, "Transfer rebates failed.");

        emit DistributeRebate(rebateWallet, amount);

        return amount;
    }

    event KyberDaoAddressSet(IKyberDAO kyberDAO);

    function setDaoContract(IKyberDAO _kyberDAO) public {
        require(msg.sender == daoSetter);

        kyberDAO = _kyberDAO;
        emit KyberDaoAddressSet(kyberDAO);

        daoSetter = address(0);
    }

    /// @dev should limit burn amount and create block delay between burns.
    function burnKNC() public returns(uint) {
        // check if current block > last burn block number + num block interval
        require(block.number > lastBurnBlock + burnBlockInterval, "Wait more block to burn");

        // update last burn block number
        lastBurnBlock = block.number;

        // Get srcQty to burn, if greater than WEI_TO_BURN, burn only WEI_TO_BURN per function call.
        (uint totalRewards, uint totalRebates) = decodeTotalValues(totalValues);

        uint totalBalance = address(this).balance;
        require(totalBalance >= totalRebates + totalRewards, "contract bal too low");

        uint srcQty = totalBalance - totalRebates - totalRewards;
        srcQty = srcQty > WEI_TO_BURN ? WEI_TO_BURN : srcQty;

        // Get the rate
        // If srcQty is too big, get expected rate will return 0 so maybe we should limit how much can be bought at one time.
        uint kyberEthKncRate = networkProxy.getExpectedRateAfterFee(
            ETH_TOKEN_ADDRESS,
            KNC,
            srcQty,
            0,
            ""
        );
        uint kyberKncEthRate = networkProxy.getExpectedRateAfterFee(
            KNC,
            ETH_TOKEN_ADDRESS,
            srcQty,
            0,
            ""
        );

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

        // Burn KNC
        require(IBurnableToken(address(KNC)).burn(destQty), "KNC burn failed");
    }

    event RewardsRemovedToBurn(uint epoch, uint rewardsWei);

    // if no one voted for an epoch (like epoch 0). no one gets reward. so should burn it.
    function shouldBurnEpochReward(uint epoch) public {
        require(address(kyberDAO) != address(0), "kyberDAO addr missing");

        require(kyberDAO.shouldBurnRewardForEpoch(epoch), "should not burn reward");

        uint rewardAmount = rewardsPerEpoch[epoch];
        require(rewardAmount > 0, "reward is 0");

        (uint totalRewardWei, uint totalRebateWei) = decodeTotalValues(totalValues);

        require(totalRewardWei >= rewardAmount, "total reward less than epoch reward");

        // any reward we subtract from total values will be burnt later.
        totalRewardWei -= rewardAmount;
        totalValues = encodeTotalValues(totalRewardWei, totalRebateWei);

        rewardsPerEpoch[epoch] = 0;

        emit RewardsRemovedToBurn(epoch, rewardAmount);
    }

    function getTotalAmounts() external view returns(uint totalRewardWei, uint totalRebateWei, uint totalBurnWei) {
        (totalRewardWei, totalRebateWei) = decodeTotalValues(totalValues);
        totalBurnWei = address(this).balance - totalRewardWei - totalRebateWei;
    }

    function encodeBRRData(uint _reward, uint _rebate, uint _epoch, uint _expiryBlock) public pure returns (uint) {
        return (((((_reward << BITS_PER_PARAM) + _rebate) << BITS_PER_PARAM) + _epoch) << BITS_PER_PARAM) + _expiryBlock;
    }

    function decodeBRRData() public view returns(uint rewardBPS, uint rebateBPS, uint expiryBlock, uint epoch) {
        expiryBlock = brrAndEpochData & (1 << BITS_PER_PARAM) - 1;
        epoch = (brrAndEpochData / (1 << BITS_PER_PARAM)) & (1 << BITS_PER_PARAM) - 1;
        rebateBPS = (brrAndEpochData / (1 << (2 * BITS_PER_PARAM))) & (1 << BITS_PER_PARAM) - 1;
        rewardBPS = (brrAndEpochData / (1 << (3 * BITS_PER_PARAM))) & (1 << BITS_PER_PARAM) - 1;
        return (rewardBPS, rebateBPS, expiryBlock, epoch);
    }

    function encodeTotalValues(uint totalRewards, uint totalRebates) public pure returns (uint) {
        return ((totalRewards << 128) + totalRebates);
    }

    function decodeTotalValues(uint encodedValues) public pure 
        returns(uint totalRewardWei, uint totalRebateWei) 
    {
        totalRebateWei = encodedValues & ((1 << 128) - 1);
        totalRewardWei = (encodedValues / (1 << 128)) & ((1 << 128) - 1);
    }

    event BRRUpdated(uint rewardBPS, uint rebateBPS, uint burnBPS, uint expiryBlock, uint epoch);

    function getBRR() public returns(uint rewardBPS, uint rebateBPS, uint epoch) {
        uint expiryBlock;
        (rewardBPS, rebateBPS, expiryBlock, epoch) = decodeBRRData();

          // Check current block number
        if (block.number > expiryBlock && kyberDAO != IKyberDAO(0)) {
            uint burnBPS;

            (burnBPS, rewardBPS, rebateBPS, epoch, expiryBlock) = kyberDAO.getLatestBRRData();

            emit BRRUpdated(rewardBPS, rebateBPS, burnBPS, expiryBlock, epoch);

            // Update brrAndEpochData
            brrAndEpochData = encodeBRRData(rewardBPS, rebateBPS, epoch, expiryBlock);
        }
    }
}
