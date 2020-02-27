pragma solidity 0.5.11;

import "./IKyberDAO.sol";
import "./IKyberFeeHandler.sol";
import "./PermissionGroupsV5.sol";
import "./IKyberNetworkProxy.sol";
import "./UtilsV5.sol";
import "./IBurnableToken.sol";
import "./IERC20.sol";

contract KyberFeeHandler is IKyberFeeHandler, Utils {

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

    mapping(address => uint) public feePerPlatformWallet;
    mapping(address => uint) public rebatePerWallet;
    mapping(uint => uint) public rewardsPerEpoch;
    mapping(uint => uint) public rewardsPayedPerEpoch;
    uint public totalPayoutBalance; // total balance in the contract that is for rebate, reward, platform fee

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

    // Todo: consider optimize to accumulate rebates is same wallet twice
    function handleFees(address[] calldata rebateWallets, uint[] calldata rebateBpsPerWallet,
        address platformWallet, uint platformFeeWei) 
        external payable onlyKyberNetwork returns(bool) 
    {
        require(msg.value >= platformFeeWei, "msg.value low");

        // handle platform fee
        feePerPlatformWallet[platformWallet] += platformFeeWei; 

        uint feeBRR = msg.value - platformFeeWei;

        if (feeBRR == 0) {
            // only platform fee payed
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

        // update balacne for rewards, rebates, fee
        totalPayoutBalance += (platformFeeWei + rewardWei + rebateWei);

        emit FeeDistributed(platformWallet, platformFeeWei, rewardWei, rebateWei, rebateWallets, rebateBpsPerWallet, 
            (feeBRR - rewardWei - rebateWei));
            
        return true;
    }

    event RewardPayed(address staker, uint amountWei);

    function claimStakerReward(address staker, uint percentageInPrecision, uint epoch) 
        external onlyDAO returns(bool) 
    {
        // Amount of reward to be sent to staker
        require(percentageInPrecision <= PRECISION, "percentage high");
        uint amount = rewardsPerEpoch[epoch] * percentageInPrecision / PRECISION;

        require(totalPayoutBalance >= amount, "Amount underflow");
        require(rewardsPayedPerEpoch[epoch] + amount <= rewardsPerEpoch[epoch], "payed per epoch high");
        rewardsPayedPerEpoch[epoch] += amount;
        totalPayoutBalance -= amount;

        // send reward to staker
        (bool success, ) = staker.call.value(amount)("");
        require(success, "Transfer staker rewards failed.");

        emit RewardPayed(staker, amount);

        return true;
    }

    event RebatePayed(address rebateWallet, uint amountWei);

    // Using rebateWallet instead of reserve so I don't have to store KyberNetwork variable.
    function claimReserveRebate(address rebateWallet) external returns (uint){
        require(rebatePerWallet[rebateWallet] > 1, "no rebate to claim");
        // Get total amount of rebate accumulated
        uint amount = rebatePerWallet[rebateWallet] - 1;

        require(totalPayoutBalance >= amount, "amount too high");
        totalPayoutBalance -= amount;

        rebatePerWallet[rebateWallet] = 1; // avoid zero to non zero storage cost

        // send rebate to rebate wallet
        (bool success, ) = rebateWallet.call.value(amount)("");
        require(success, "Transfer rebates failed.");

        emit RebatePayed(rebateWallet, amount);

        return amount;
    }

    event PlatformFeePayed(address platformWallet, uint amountWei);

    function claimPlatformFee(address platformWallet) external returns(uint feeWei) {
        require(feePerPlatformWallet[platformWallet] > 1, "no fee to claim");
        // Get total amount of rebate accumulated
        uint amount = feePerPlatformWallet[platformWallet] - 1;

        require(totalPayoutBalance >= amount, "amount too high");
        totalPayoutBalance -= amount;

        feePerPlatformWallet[platformWallet] = 1; // avoid zero to non zero storage cost

        (bool success, ) = platformWallet.call.value(amount)("");
        require(success, "Transfer fee failed.");

        emit PlatformFeePayed(platformWallet, amount);
        return amount;
    }

    event KyberDaoAddressSet(IKyberDAO kyberDAO);

    function setDaoContract(IKyberDAO _kyberDAO) public {
        require(msg.sender == daoSetter);

        kyberDAO = _kyberDAO;
        emit KyberDaoAddressSet(kyberDAO);

        daoSetter = address(0);
    }

    event KNCBurned(uint KNCTWei, uint amountWei);

    /// @dev should limit burn amount and create block delay between burns.
    function burnKNC() public returns(uint) {
        // check if current block > last burn block number + num block interval
        require(block.number > lastBurnBlock + burnBlockInterval, "Wait more block to burn");

        // update last burn block number
        lastBurnBlock = block.number;

        // Get srcQty to burn, if greater than WEI_TO_BURN, burn only WEI_TO_BURN per function call.
        uint balance = address(this).balance;
        require(balance >= totalPayoutBalance, "contract bal too low");

        uint srcQty = balance - totalPayoutBalance;
        srcQty = srcQty > WEI_TO_BURN ? WEI_TO_BURN : srcQty;

        // Get the rate
        // If srcQty is too big, get expected rate will return 0 so maybe we should limit how much can be bought at one time.
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
    }

    event RewardsRemovedToBurn(uint epoch, uint rewardsWei);

    // if no one voted for an epoch (like epoch 0). no one gets reward. so should burn it.
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

    function getRRWeiValues(uint RRAmountWei) internal 
        returns(uint rewardWei, uint rebateWei, uint epoch)
    {
        // Decoding BRR data
        uint rewardInBPS;
        uint rebateInBPS;
        (rewardInBPS, rebateInBPS, epoch) = getBRR();

        rebateWei = RRAmountWei * rebateInBPS / BPS;
        rewardWei = RRAmountWei * rewardInBPS / BPS;
    }
}
