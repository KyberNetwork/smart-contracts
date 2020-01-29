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

    IKyberDAO public kyberDAOContract;
    IKyberNetworkProxy public kyberNetworkProxyContract;
    address public kyberNetworkContract;
    IBurnableToken public knc;
    uint public burnBlockInterval;
    uint public lastBurnBlock;
    uint public brrAndEpochData;
    // Todo: combine totalRebates and totalRewards into one variable
    mapping(address => uint) public rebatePerWallet;
    mapping(uint => uint) public rewardsPerEpoch;
    uint public totalValues; // total rebates, total rewards

    constructor(
        IKyberDAO _kyberDAOContract,
        IKyberNetworkProxy _kyberNetworkProxyContract,
        address _kyberNetworkContract,
        IBurnableToken _knc,
        uint _burnBlockInterval
    ) public
    {
        require(address(_kyberDAOContract) != address(0), "FeeHandler: KyberDAO address 0");
        require(address(_kyberNetworkProxyContract) != address(0), "FeeHandler: KyberNetworkProxy address 0");
        require(address(_kyberNetworkContract) != address(0), "FeeHandler: KyberNetwork address 0");
        require(address(_knc) != address(0), "FeeHandler: KNC address 0");
        require(_burnBlockInterval != 0, "FeeHandler: _burnBlockInterval 0");

        kyberDAOContract = _kyberDAOContract;
        kyberNetworkProxyContract = _kyberNetworkProxyContract;
        kyberNetworkContract = _kyberNetworkContract;
        knc = _knc;
        burnBlockInterval = _burnBlockInterval;
    }

    modifier onlyDAO {
        require(
            msg.sender == address(kyberDAOContract),
            "Only the DAO can call this function."
        );
        _;
    }

    modifier onlyKyberNetwork {
        require(
            msg.sender == address(kyberNetworkContract),
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

    // Todo: future optimisation to accumulate rebates for 2 rebate wallet
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

    function claimStakerReward(address staker, uint percentageInPrecision, uint epoch) external onlyDAO returns(uint) {
        // Amount of reward to be sent to staker
        uint amount = rewardsPerEpoch[epoch] * percentageInPrecision / PRECISION;

        // Update total rewards and total rewards per epoch
        require(rewardsPerEpoch[epoch] >= amount, "Integer underflow on rewardsPerEpoch[epoch]");
        (uint totalRewards , uint totalRebates) = decodeTotalValues(totalValues);
        require(totalRewards >= amount, "Integer underflow on totalRewards");
        // Do not use 0 to avoid paying high gas when setting back from 0 to non zero
        rewardsPerEpoch[epoch] = rewardsPerEpoch[epoch] - amount == 0 ? 1 : rewardsPerEpoch[epoch] - amount;
        totalRewards = totalRewards - amount == 0 ? 1 : totalRewards - amount;

        totalValues = encodeTotalValues(totalRewards, totalRebates);
        // send reward to staker
        (bool success, ) = staker.call.value(amount - 1)("");
        require(success, "Transfer of rewards to staker failed.");

        emit DistributeRewards(staker, amount - 1);

        return amount - 1;
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
        uint expectedRate = kyberNetworkProxyContract.getExpectedRateAfterCustomFee(
            IERC20(ETH_TOKEN_ADDRESS),
            IERC20(address(knc)),
            srcQty,
            0,
            ""
        );

        // Buy some KNC and burn
        uint destQty = kyberNetworkProxyContract.tradeWithHintAndPlatformFee(
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
        if(block.number > expiryBlock) {
            uint burnBPS;

            (burnBPS, rewardBPS, rebateBPS, epoch, expiryBlock) = kyberDAOContract.getLatestBRRData();

            emit BRRUpdated(rewardBPS, rebateBPS, burnBPS, expiryBlock, epoch);

            // Update brrAndEpochData
            brrAndEpochData = encodeBRRData(rewardBPS, rebateBPS, epoch, expiryBlock);
        }
    }
}
