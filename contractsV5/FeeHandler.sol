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
    uint public totalRebates;
    mapping(address => uint) public totalRebatesPerRebateWallet;
    uint public totalRewards;
    mapping(uint => uint) public totalRewardsPerEpoch;

    constructor(
        IKyberDAO _kyberDAOContract,
        IKyberNetworkProxy _kyberNetworkProxyContract,
        address _kyberNetworkContract,
        IBurnableToken _knc,
        uint _burnBlockInterval
    ) public
    {
        require(address(_kyberDAOContract) != address(0), "The KyberDAO contract cannot be the null address");
        require(address(_kyberNetworkProxyContract) != address(0), "The KyberNetworkProxy contract cannot be the null address");
        require(address(_kyberNetworkContract) != address(0), "The KyberNetwork contract cannot be the null address");
        require(address(_knc) != address(0), "The KNC token contract cannot be the null address");

        kyberDAOContract = _kyberDAOContract;
        kyberNetworkProxyContract = _kyberNetworkProxyContract;
        kyberNetworkContract = _kyberNetworkContract;
        knc = _knc;
        burnBlockInterval = _burnBlockInterval;
        lastBurnBlock = block.number;
        (, uint rewardInBPS, uint rebateInBPS, uint epoch, uint expiryBlock) = kyberDAOContract.getLatestBRRData();
        brrAndEpochData = encodeData(rewardInBPS, rebateInBPS, epoch, expiryBlock);
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
            "Only the internal KyberNetwork contract can call this function."
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
        (uint rewardInBPS, uint rebateInBPS, uint epoch, uint expiryBlock) = decodeData();

        // Check current block number
        if(block.number > expiryBlock) {
            (, rewardInBPS, rebateInBPS, epoch, expiryBlock) = kyberDAOContract.getLatestBRRData();

            // Update brrAndEpochData
            brrAndEpochData = encodeData(rewardInBPS, rebateInBPS, epoch, expiryBlock);
        }

        uint rebateWei = rebateInBPS * msg.value / BPS;
        uint rewardWei = rewardInBPS * msg.value / BPS;
        for(uint i = 0; i < eligibleWallets.length; i ++) {
            // Internal accounting for rebates per reserve wallet (totalRebatesPerRebateWallet)
            totalRebatesPerRebateWallet[eligibleWallets[i]] = rebateWei * rebatePercentages[i] / 100;
        }

        // Internal accounting for total rebates (totalRebates)
        totalRebates += rebateWei;
        // Internal accounting for reward per epoch (totalRewardsPerEpoch)
        totalRewardsPerEpoch[epoch] += rewardWei;
        // Internal accounting for total rewards (totalRewards)
        totalRewards += rewardWei;

        emit AccumulateReserveRebate(eligibleWallets, rebatePercentages, rebateWei, rewardWei, msg.value - rebateWei - rewardWei);

        return true;
    }

    event DistributeRewards(address staker, uint amountWei);

    function claimStakerReward(address staker, uint percentageInPrecision, uint epoch) public onlyDAO returns(uint) {
        // Amount of reward to be sent to staker
        uint amount = totalRewardsPerEpoch[epoch] * percentageInPrecision / PRECISION;

        // Update total rewards and total rewards per epoch
        require(totalRewardsPerEpoch[epoch] >= amount, "Integer underflow on totalRewardsPerEpoch[epoch]");
        require(totalRewards >= amount, "Integer underflow on totalRewards");
        // Do not use 0 to avoid paying high gas when setting back from 0 to non zero
        totalRewardsPerEpoch[epoch] = totalRewardsPerEpoch[epoch] - amount == 0 ? 1 : totalRewardsPerEpoch[epoch] - amount;
        totalRewards = totalRewards - amount == 0 ? 1 : totalRewards - amount;

        // send reward to staker
        (bool success, ) = staker.call.value(amount - 1)("");
        require(success, "Transfer of rewards to staker failed.");

        emit DistributeRewards(staker, amount - 1);

        return amount - 1;
    }

    event DistributeRebate(address rebateWallet, uint amountWei);

    // Using rebateWallet instead of reserve so I don't have to store KyberNetwork variable.
    function claimReserveRebate(address rebateWallet) public returns (uint){
        // Get total amount of rebate accumulated
        uint amount = totalRebatesPerRebateWallet[rebateWallet] - 1;

        // Update total rebate and rebate per rebate wallet amounts
        totalRebates -= amount;
        totalRebatesPerRebateWallet[rebateWallet] = 1; // Do not use 0 to avoid paying high gas when setting back from 0 to non zero.

        // send rebate to rebate wallet
        (bool success, ) = rebateWallet.call.value(amount)("");
        require(success, "Transfer of rebates to rebate wallet failed.");

        emit DistributeRebate(rebateWallet, amount);

        return amount;
    }

    // we will have to limit amounts. per burn.
    // and create some block delay between burns.
    // Todo: include arbitrage check https://github.com/KyberNetwork/smart-contracts/pull/433/files
    function burnKNC() public returns(uint) {
        // check if current block > last buy block number + num block interval
        require(
            block.number < lastBurnBlock + burnBlockInterval,
            "Unable to buy as burnBlockInterval has not passed since lastBurnBlock"
        );

        // update last burn block number
        lastBurnBlock = block.number;

        // Get srcQty to burn, if greater than ETH_TO_BURN, burn only ETH_TO_BURN per function call.
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


    function encodeData(uint _reward, uint _rebate, uint _epoch, uint _expiryBlock) public pure returns (uint) {
        return (((((_reward << BITS_PER_PARAM) + _rebate) << BITS_PER_PARAM) + _epoch) << BITS_PER_PARAM) + _expiryBlock;
    }

    function decodeData() public view returns(uint, uint, uint, uint) {
        uint expiryBlockNumber = brrAndEpochData & (1 << BITS_PER_PARAM) - 1;
        uint epoch = (brrAndEpochData / (1 << BITS_PER_PARAM)) & (1 << BITS_PER_PARAM) - 1;
        uint rebateInBPS = (brrAndEpochData / (1 << BITS_PER_PARAM << BITS_PER_PARAM)) & (1 << BITS_PER_PARAM) - 1;
        uint rewardInBPS = (brrAndEpochData / (1 << BITS_PER_PARAM << BITS_PER_PARAM << BITS_PER_PARAM)) & (1 << BITS_PER_PARAM) - 1;
        return (rewardInBPS, rebateInBPS, epoch, expiryBlockNumber);
    }
}
