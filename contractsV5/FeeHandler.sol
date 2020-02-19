pragma solidity 0.5.11;

import "./IKyberDAO.sol";
import "./IFeeHandler.sol";
import "./PermissionGroupsV5.sol";
import "./IKyberNetworkProxy.sol";
import "./UtilsV5.sol";
import "./IBurnableToken.sol";
import "./IERC20.sol";

contract FeeHandler is IFeeHandler, Utils {

    uint constant ETH_TO_BURN = 10**19;
    uint constant BITS_PER_PARAM = 64;
    uint constant DEFAULT_REWARD_BPS = 3000;
    uint constant DEFAULT_REBATE_BPS = 3000;

    IKyberDAO public kyberDAO;
    IKyberNetworkProxy public networkProxy;
    address public kyberNetwork;
    IBurnableToken public knc;
    
    uint public burnBlockInterval;
    uint public lastBurnBlock;
    uint public brrAndEpochData;
    address public daoSetter;

    mapping(address => uint) public rebatePerWallet;
    mapping(uint => uint) public rewardsPerEpoch;
    uint public totalValues; // total rebates, total rewards

    constructor(
        address _daoSetter,
        IKyberNetworkProxy _networkProxy,
        address _kyberNetwork,
        IBurnableToken _knc,
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
        knc = _knc;
        burnBlockInterval = _burnBlockInterval;

        //start with epoch 0
        brrAndEpochData = encodeBRRData(DEFAULT_REWARD_BPS, DEFAULT_REBATE_BPS, 0, block.number);
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
        uint[] rebatePercentages,
        uint totalRebateAmtWei,
        uint totalRewardAmtWei,
        uint totalBurnAmtWei
    );

    // Todo: future optimize to accumulate rebates is same wallet twice
    // encode totals, 128 bits per reward / rebate
    function handleFees(address[] calldata eligibleWallets, uint[] calldata rebatePercentages) external payable onlyKyberNetwork returns(bool) {
        // Decoding BRR data
        (uint rewardInBPS, uint rebateInBPS, uint epoch) = getBRR();

        uint rebateWei = rebateInBPS * msg.value / BPS;
        uint rewardWei = rewardInBPS * msg.value / BPS;
        for(uint i = 0; i < eligibleWallets.length; i ++) {
            // Internal accounting for rebates per reserve wallet (rebatePerWallet)
            rebatePerWallet[eligibleWallets[i]] = rebateWei * rebatePercentages[i] / 100;
        }

        (uint totalRewards , uint totalRebates) = decodeTotalValues(totalValues);
        // Internal accounting for total rebates (totalRebates)
        totalRebates += rebateWei;
        // Internal accounting for reward per epoch (rewardsPerEpoch)
        rewardsPerEpoch[epoch] += rewardWei;
        // Internal accounting for total rewards (totalRewards)
        totalRewards += rewardWei;

        totalValues = encodeTotalValues(totalRewards, totalRebates);

        emit AccumulateReserveRebate(eligibleWallets, rebatePercentages, rebateWei, rewardWei, msg.value - rebateWei - rewardWei);

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
        
        rewardsPerEpoch[epoch] = rewardsPerEpoch[epoch] - amount;
        totalRewards = totalRewards - amount;

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
        // Get total amount of rebate accumulated
        uint amount = rebatePerWallet[rebateWallet] - 1;

        // Update total rebate and rebate per rebate wallet amounts
        (uint totalRewards , uint totalRebates) = decodeTotalValues(totalValues);
        
        totalRebates -= amount;
        rebatePerWallet[rebateWallet] = 1; // Do not use 0 to avoid paying high gas when setting back from 0 to non zero.

        totalValues = encodeTotalValues(totalRewards, totalRebates);
        
        // send rebate to rebate wallet
        (bool success, ) = rebateWallet.call.value(amount)("");
        require(success, "Transfer of rebates to rebate wallet failed.");

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

    // this to get Brr data and avoid any trade to pay the gas for it.
    function getBRRData () public {
        getBRR();
    }
    
    // we will have to limit amounts. per burn.
    // and create some block delay between burns.
    // Todo: include arbitrage check https://github.com/KyberNetwork/smart-contracts/pull/433/files
    function burnKNC() public returns(uint) {
        // check if current block > last buy block number + num block interval
        require(
            block.number < lastBurnBlock + burnBlockInterval,
            "Burn blocked up to block: lastBurnBlock + burnBlockInterval"
        );

        // update last burn block number
        lastBurnBlock = block.number;

        // Get srcQty to burn, if greater than ETH_TO_BURN, burn only ETH_TO_BURN per function call.
        (uint totalRewards , uint totalRebates) = decodeTotalValues(totalValues);
        uint srcQty = address(this).balance - totalRebates - totalRewards;
        srcQty = srcQty > ETH_TO_BURN ? ETH_TO_BURN : srcQty;

        // Get the rate
        // If srcQty is too big, get expected rate will return 0 so maybe we should limit how much can be bought at one time.
        uint expectedRate = networkProxy.getExpectedRateAfterFee(
            IERC20(ETH_TOKEN_ADDRESS),
            IERC20(address(knc)),
            srcQty,
            0,
            ""
        );

        // Buy some KNC and burn
        uint destQty = networkProxy.tradeWithHintAndFee(
            ETH_TOKEN_ADDRESS,
            srcQty,
            IERC20(address(knc)),
            address(uint160(address(this))), // Convert this address into address payable
            MAX_QTY,
            expectedRate * 97 / 100,
            address(0), // platform wallet
            0, // platformFeeBps
            "" // hint
        );

        // Burn KNC
        require(knc.burn(destQty), "KNC burn failed");
    }

    event RewardsRemovedToBurn(uint epoch, uint rewardsWei);

    // if no one voted for an epoch (like epoch 0). no one gets reward. so should burn it.
    function shouldBurnEpochReward(uint epoch) public {
        if (!kyberDAO.shouldBurnRewardForEpoch(epoch)) return;

        uint rewardAmount = rewardsPerEpoch[epoch];

        (uint totalRewardWei, ) = decodeTotalValues(totalValues);

        require(totalRewardWei >= rewardAmount);
        
        // any reward we subtract from total values will be burnt later.
        totalRewardWei -= rewardAmount;
        rewardsPerEpoch[epoch] = 0;

        emit RewardsRemovedToBurn(epoch, rewardAmount);
    }

    function encodeBRRData(uint _reward, uint _rebate, uint _epoch, uint _expiryBlock) public pure returns (uint) {
        return (((((_reward << BITS_PER_PARAM) + _rebate) << BITS_PER_PARAM) + _epoch) << BITS_PER_PARAM) + _expiryBlock;
    }

    function decodeBRRData() public view returns(uint rewardBPS, uint rebateBPS, uint expiryBlock, uint epoch) {
        expiryBlock = brrAndEpochData & (1 << BITS_PER_PARAM) - 1;
        epoch = (brrAndEpochData / (1 << BITS_PER_PARAM)) & (1 << BITS_PER_PARAM) - 1;
        rebateBPS = (brrAndEpochData / (1 << (2 * BITS_PER_PARAM))) & (1 << BITS_PER_PARAM) - 1;
        rewardBPS = (brrAndEpochData / (1 << (3 * BITS_PER_PARAM))) & (1 << BITS_PER_PARAM) - 1;
        return (rewardBPS, rebateBPS, epoch, expiryBlock);
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

    function getBRR() internal returns(uint rewardBPS, uint rebateBPS, uint epoch) {
        uint expiryBlock;
        (rewardBPS, rebateBPS, expiryBlock, epoch) = decodeBRRData();

          // Check current block number
        if(block.number > expiryBlock && kyberDAO != IKyberDAO(0)) {
            uint burnBPS;

            (burnBPS, rewardBPS, rebateBPS, epoch, expiryBlock) = kyberDAO.getLatestBRRData();

            emit BRRUpdated(rewardBPS, rebateBPS, burnBPS, expiryBlock, epoch);

            // Update brrAndEpochData
            brrAndEpochData = encodeBRRData(rewardBPS, rebateBPS, epoch, expiryBlock);
        }
    }
}
