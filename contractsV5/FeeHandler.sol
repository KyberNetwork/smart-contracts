pragma solidity 0.5.11;

import "./IKyberDAO.sol";
import "./KyberNetwork.sol"
import "./IFeeHandler.sol";
import "./PermissionGroupsV5.sol";
import "./UtilsV5.sol";

contract FeeHandler is IFeeHandler, UtilsV5 {

    IKyberDAO public kyberDAOContract;
    KyberNetwork public kyberNetworkContract;

    // Todo: Add the correct startBlock and epoch duration values
    uint constant STARTBLOCK = 0;
    uint constant EPOCH = 10000;

    uint public brrAndEpochData;

    uint constant BITS_PER_PARAM = 64;
    uint public burnInBPS;
    uint public rebateInBPS;
    uint public rewardInBPS;
    uint public epoch;
    uint public expiryBlock;

    uint public totalRebates;
    mapping(uint => address) public totalRebatesPerRebateWallet;
    mapping(address => address) public reserveRebateWallet;
    uint public totalRewards;
    mapping(uint => uint) public totalRewardsPerEpoch;

    constructor(IKyberDAO _kyberDAOContract, KyberNetwork _kyberNetworkContract) {
        kyberDAOContract = _kyberDAOContract;
        kyberNetworkContract = _kyberNetworkContract;
    }


    function encodeData(uint _burn, uint _reward, uint _epoch, uint _expiryBlock) public {
        brrAndEpochData = (((((_burn << BITS_PER_PARAM) + _reward) << BITS_PER_PARAM) + _epoch) << BITS_PER_PARAM) + _expiryBlock;
    }

    function decodeData() public {
        expiryBlock = brrAndEpochData & (1 << BITS_PER_PARAM) - 1;
        epoch = (brrAndEpochData / (1 << BITS_PER_PARAM)) & (1 << BITS_PER_PARAM) - 1;
        rewardInBPS = (brrAndEpochData / (1 << BITS_PER_PARAM << BITS_PER_PARAM)) & (1 << BITS_PER_PARAM) - 1;
        burnInBPS = (brrAndEpochData / (1 << BITS_PER_PARAM << BITS_PER_PARAM << BITS_PER_PARAM)) & (1 << BITS_PER_PARAM) - 1;
        rebateInBPS = BPS - rewardInBPS - burnInBPS;
    }

    function handleFees(address[] calldata eligibleReserves, uint[] calldata rebatePercentages) external payable returns(bool) {
        
        // Per trade check epoch number, and if changed, call DAO to get existing percentage values for reward / burn / rebate
        // Rebates to reserves if entitled. (if reserve isn’t entitled, it means fee wasn’t taken!)
        // Internal accounting per reserve.
        // Update total_reserve_rebate
        // Update rewards
        // Update total_reward [epoch]
        // Update total_reward_amount.
        // Eth for burning is the remaining == (total balance - total_reward_amount - total_reserve_rebate).


        // When you update reserve rebate, you must first check if 2 reserves i.e. handled on both token to eth n eth to token.
        // encode totals, 128 bits per reward / rebate.
        // accumulate rebates per wallet instead of per reserve use reserveRebateWallet
        return true;
    }


    function claimStakerReward(address staker, uint percentageinPrecision, uint epoch) public {
        // onlyDAO
        // send reward
        // update rewardPerEpoch
        // update totalReward
    }

    function claimReserveRebate(address reserve) public {
        // only DAO
        // send rebate to reserve
        // update rebatePerReserve;
        // update total rebate amounts?
        // update reserve rebate to 1 (avoid 0...) otherwise div by 0 issue? but will we even need to div by 0?
        // if we include a dest address, we need an owner / admin of the reserve and the below function.
    }

    function burnKNC() public {
        // only DAO?
        // convert fees to KNC and burn
    }

    function setReserveRebateWallet(address reserve, address wallet) public returns (bool){
    }


}
