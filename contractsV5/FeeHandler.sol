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
    function handleFees(address[] calldata eligibleWallets, uint[] calldata rebatePercentages) external payable returns(bool) {
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


    function claimStakerReward(address staker, uint percentageInPrecision, uint epoch) public {
        // onlyDAO?
        // send reward
        // update rewardPerEpoch
        // update totalReward
    }

    function claimReserveRebate(address reserve) public {
        // only DAO?
        // send rebate to rebate wallet
        // update rebatePerReserve;
        // update total rebate amounts?
        // update reserve rebate to 1 (avoid 0...) otherwise div by 0 issue? but will we even need to div by 0?
        // if we include a dest address, we need an owner / admin of the reserve and the below function.
    }

    function burnKNC() public {
        // only DAO?
        // convert fees to KNC and burn
        // Eth for burning is the remaining == (total balance - total_reward_amount - total_reserve_rebate).
    }
}
