pragma solidity 0.5.11;

import "./IKyberDAO.sol";
import "./IFeeHandler.sol";
import "./PermissionGroupsV5.sol";
import "./KyberNetworkProxy.sol";
import "./UtilsV5.sol";
import "./IERC20.sol";

contract FeeHandler is IFeeHandler, Utils {

    IKyberDAO public kyberDAOContract;
    // if I use the interface, I am not able to get the KyberNetwork internal contract from the proxy..
    KyberNetworkProxy public kyberNetworkProxyContract;
    address public knc;
    address payable public burnAddress;
    uint public burnBlockInterval;
    uint public lastBurnBlock;
    uint constant ETH_TO_BURN = 10**19;

    uint public brrAndEpochData;
    uint constant BITS_PER_PARAM = 64;

    uint public totalRebates;
    mapping(address => uint) public totalRebatesPerRebateWallet;
    uint public totalRewards;
    mapping(uint => uint) public totalRewardsPerEpoch;


    constructor(
        IKyberDAO _kyberDAOContract,
        KyberNetworkProxy _kyberNetworkProxyContract,
        address _knc,
        address payable _burnAddress,
        uint _burnBlockInterval
    ) public
    {
        kyberDAOContract = _kyberDAOContract;
        kyberNetworkProxyContract = _kyberNetworkProxyContract;
        knc = _knc;
        burnAddress = _burnAddress;
        burnBlockInterval = _burnBlockInterval;
        lastBurnBlock = block.number;
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
            msg.sender == address(kyberNetworkProxyContract.kyberNetworkContract()),
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

    event AccumulateReserveRebate(address rebateWallet, uint rebateAmountWei);

    // Todo: future optimisation to accumulate rebates for 2 rebate wallet
    // encode totals, 128 bits per reward / rebate
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

            emit AccumulateReserveRebate(eligibleWallets[i], rebateWei * rebatePercentages[i] / 100);
        }
        return true;
    }

    event DistributeRewards(address staker, uint amountWei);

    function claimStakerReward(address staker, uint percentageInPrecision, uint epoch) public onlyDAO returns(uint) {
        // Amount of reward to be sent to staker
        uint amount = totalRewardsPerEpoch[epoch] * percentageInPrecision / 10**18;

        // Update total rewards and total rewards per epoch
        totalRewardsPerEpoch[epoch] -= amount;
        totalRewards -= amount;

        // send reward to staker
        (bool success, ) = staker.call.value(amount)("");
        require(success, "Transfer of rewards to staker failed.");

        emit DistributeRewards(staker, amount);

        return amount;

    }

    event DistributeRebate(address rebateWallet, uint amountWei);

    // Using rebateWallet instead of reserve so I don't have to store KyberNetwork variable.
    function claimReserveRebate(address rebateWallet) public returns (uint){
        // Get total amount of rebate accumulated
        uint amount = totalRebatesPerRebateWallet[rebateWallet] - 1;

        // Update total rebate and rebate per rebate wallet amounts
        totalRebates -= amount;
        totalRebatesPerRebateWallet[rebateWallet] = 1; // Do not use 0 to avoid potential issues with div by 0

        // send rebate to rebate wallet
        (bool success, ) = rebateWallet.call.value(amount)("");
        require(success, "Transfer of rebates to rebate wallet failed.");

        emit DistributeRebate(rebateWallet, amount);

        return amount;
    }

    event BurnKNC(address burnAddress, uint amountWei);

    // we will have to limit amounts. per burn.
    // and create some block delay between burns.
    function burnKNC() public returns(uint) {
        // check if current block > last buy block number + num block interval
        require(
            block.number < lastBurnBlock + burnBlockInterval,
            "Unable to burn as burnBlockInterval has not passed since lastBurnBlock"
        );

        // update last buy block number
        lastBurnBlock = block.number;

        // Get srcQty to burn, if greater than 10 ETH, burn only 10 ETH per function call.
        uint srcQty = address(this).balance - totalRebates - totalRewards;

        srcQty = srcQty > ETH_TO_BURN ? ETH_TO_BURN : srcQty;

        // Get the slippage rate
        // If srcQty is too big, get expected rate will return 0 so maybe we should limit how much can be bought at one time.
        uint expectedRate = kyberNetworkProxyContract.getExpectedRateAfterCustomFee(IERC20(ETH_TOKEN_ADDRESS), IERC20(knc), srcQty, 0, "");

        // Buy some KNC and send to burn address
        // Swap the ERC20 token and send to destAddress
        uint destQty = kyberNetworkProxyContract.tradeWithHintAndPlatformFee(
            ETH_TOKEN_ADDRESS,
            srcQty,
            IERC20(knc),
            burnAddress,
            MAX_QTY,
            expectedRate * 97 / 100,
            address(0), // platform wallet
            0, // platformFeeBps
            "" // hint
        );

        // emit event
        emit BurnKNC(burnAddress, destQty);
    }
}
