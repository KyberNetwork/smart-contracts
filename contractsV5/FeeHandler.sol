pragma solidity 0.5.11;

import "./IKyberDAO.sol";
import "./KyberNetwork.sol";
import "./IFeeHandler.sol";
import "./PermissionGroupsV5.sol";
import "./UtilsV5.sol";

contract FeeHandler is IFeeHandler, Utils {

    IKyberDAO public kyberDAOContract;
    KyberNetwork public kyberNetworkContract;

    uint public brrAndEpochData;

    uint constant BITS_PER_PARAM = 64;

    uint public totalRebates;
    mapping(address => uint) public totalRebatesPerRebateWallet;
    uint public totalRewards;
    mapping(uint => uint) public totalRewardsPerEpoch;

    constructor(IKyberDAO _kyberDAOContract, KyberNetwork _kyberNetworkContract) public {
        kyberDAOContract = _kyberDAOContract;
        kyberNetworkContract = _kyberNetworkContract;
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


    function encodeData(uint _burn, uint _reward, uint _epoch, uint _expiryBlock) public pure returns (uint) {
        return (((((_burn << BITS_PER_PARAM) + _reward) << BITS_PER_PARAM) + _epoch) << BITS_PER_PARAM) + _expiryBlock;
    }

    function decodeData() public view returns(uint, uint, uint, uint) {
        uint expiryBlock = brrAndEpochData & (1 << BITS_PER_PARAM) - 1;
        uint epoch = (brrAndEpochData / (1 << BITS_PER_PARAM)) & (1 << BITS_PER_PARAM) - 1;
        uint rewardInBPS = (brrAndEpochData / (1 << BITS_PER_PARAM << BITS_PER_PARAM)) & (1 << BITS_PER_PARAM) - 1;
        uint burnInBPS = (brrAndEpochData / (1 << BITS_PER_PARAM << BITS_PER_PARAM << BITS_PER_PARAM)) & (1 << BITS_PER_PARAM) - 1;
        return (burnInBPS, rewardInBPS, epoch, expiryBlock);
    }

    // Todo: future optimisation to accumulate rebates for 2 rebate wallet
    // encode totals, 128 bits per reward / rebate
    // Need onlyKyberNetwork modifier because
    // 1) functions in interface need to be external
    // 2) internal functions cannot be payable
    function handleFees(address[] calldata eligibleWallets, uint[] calldata rebatePercentages) external payable onlyKyberNetwork returns(bool) {
        // Decoding BRR data
        (uint burnInBPS, uint rewardInBPS, uint epoch, uint expiryBlock) = decodeData();
        uint rebateInBPS = BPS - rewardInBPS - burnInBPS;

        // Check current block number
        if(block.number > expiryBlock) {
            (burnInBPS, rewardInBPS, rebateInBPS, epoch, expiryBlock) = kyberDAOContract.getLatestBRRData();

            // Update brrAndEpochData
            brrAndEpochData = encodeData(burnInBPS, rewardInBPS, epoch, expiryBlock);
        }

        uint rebateWei = rebateInBPS * msg.value / BPS;
        uint rewardWei = rewardInBPS * msg.value / BPS;
        for(uint i = 0; i < eligibleWallets.length; i ++) {
            // Internal accounting for rebates per reserve wallet (totalRebatesPerRebateWallet)
            totalRebatesPerRebateWallet[eligibleWallets[i]] = rebateWei * rebatePercentages[i] / 100;
            // Internal accounting for total rebates (totalRebates)
            totalRebates += rebateWei * rebatePercentages[i] / 100;
            // Internal accounting for reward per epoch (totalRewardsPerEpoch)
            totalRewardsPerEpoch[epoch] += rewardWei;
            // Internal accounting for total rewards (totalRewards)
            totalRewards += rewardWei;
        }
        // Todo: emit event
        return true;
    }

    function claimStakerReward(address staker, uint percentageInPrecision, uint epoch) public onlyDAO returns(uint) {
        // Amount of reward to be sent to staker
        uint amount = totalRewardsPerEpoch[epoch] * percentageInPrecision / 10**18;

        // Update total rewards and total rewards per epoch
        totalRewardsPerEpoch[epoch] -= amount;
        totalRewards -= amount;

        // send reward to staker
        (bool success, ) = staker.call.value(amount)("");
        require(success, "Transfer of rewards to staker failed.");

        // Todo: emit event
        return amount;

    }

    // Maybe we should pass in rebate wallet instead of reserve address? If so, we can remove the kyberNetworkContract variable.
    function claimReserveRebate(address reserve) public returns (uint){
        // Get rebate wallet address from KyberNetwork contract
        address rebateWallet = kyberNetworkContract.reserveRebateWallet(reserve);

        // Get total amount of rebate accumulated
        uint amount = totalRebatesPerRebateWallet[rebateWallet] - 1;

        // Update total rebate and rebate per rebate wallet amounts
        totalRebates -= amount;
        totalRebatesPerRebateWallet[rebateWallet] = 1; // Do not use 0 to avoid potential issues with div by 0

        // send rebate to rebate wallet
        (bool success, ) = rebateWallet.call.value(amount)("");
        require(success, "Transfer of rebates to rebate wallet failed.");
        
        // Todo: emit event
        return amount;
    }

    function burnKNC() public {
        // convert fees to KNC and burn
        // Eth for burning is the remaining == (total balance - total_reward_amount - total_reserve_rebate).
    }
}
