pragma solidity 0.6.6;

import "../../IKyberFeeHandler.sol";
import "../../utils/PermissionGroupsNoModifiers.sol";
import "../../utils/zeppelin/ReentrancyGuard.sol";
import "../../utils/zeppelin/SafeMath.sol";
import "../../utils/Utils5.sol";

/**
 * @title kyberFeeHandler
 *
 * @dev EmergencyFeeHandler works when dao has problem
 *      rebateBps and rewardBps is only set when initialization
 *      user can claim platformfee, rebate and reward will be distributed by admin
 */
contract EmergencyKyberFeeHandler is IKyberFeeHandler, PermissionGroupsNoModifiers, ReentrancyGuard, Utils5 {
    using SafeMath for uint256;

    uint16 public immutable rewardBps;
    uint16 public immutable rebateBps;
    address public kyberNetwork;

    mapping(address => uint256) public feePerPlatformWallet;
    uint256 public totalPlatformFeeWei; // total balance in the contract that is for platform fee
    mapping(address => uint256) public rebatePerWallet;
    uint256 public totalRewardWei;

    struct BRRWei {
        uint256 rewardWei;
        uint256 fullRebateWei;
        uint256 paidRebateWei;
        uint256 burnWei;
    }

    event HandleFeeFailed(address[] rebateWallets, uint256[] rebateBpsPerWallet, uint256 feeBRRWei);

    event HandleFee(
        IERC20 indexed token,
        address indexed platformWallet,
        uint256 platformFeeWei,
        address[] rebateWallets,
        uint256[] rebateBpsPerWallet,
        uint256 feeBRRWei
    );

    event FeeDistribution(
        IERC20 indexed token,
        address indexed platformWallet,
        uint256 platformFeeWei,
        uint256 rewardWei,
        uint256 rebateWei,
        address[] rebateWallets,
        uint256[] rebatePercentBpsPerWallet,
        uint256 burnAmountWei
    );

    event EtherWithdraw(uint256 amount, address sendTo);

    event KyberNetworkUpdated(address kyberNetwork);

    constructor(
        address admin,
        address _kyberNetwork,
        uint256 _rewardBps,
        uint256 _rebateBps,
        uint256 _burnBps
    ) public PermissionGroupsNoModifiers(admin) {
        require(_burnBps.add(_rewardBps).add(_rebateBps) == BPS, "Bad BRR values");
        rewardBps = uint16(_rewardBps);
        rebateBps = uint16(_rebateBps);
        kyberNetwork = _kyberNetwork;
    }

    modifier onlyKyberNetwork {
        require(msg.sender == address(kyberNetwork), "only kyberNetwork");
        _;
    }

    /// @dev handleFees function is called per trade on KyberNetwork. unless the trade is not involving any fees.
    /// @param token Token currency of fees
    /// @param rebateWallets a list of rebate wallets that will get rebate for this trade.
    /// @param rebateBpsPerWallet percentage of rebate for each wallet, out of total rebate.
    /// @param platformWallet Wallet address that will receive the platfrom fee.
    /// @param platformFee Fee amount in wei the platfrom wallet is entitled to.
    /// @param networkFee Fee amount (in wei) to be allocated for BRR
    function handleFees(
        IERC20 token,
        address[] calldata rebateWallets,
        uint256[] calldata rebateBpsPerWallet,
        address platformWallet,
        uint256 platformFee,
        uint256 networkFee
    ) external payable override onlyKyberNetwork nonReentrant {
        require(token == ETH_TOKEN_ADDRESS, "token not eth");
        require(msg.value == platformFee.add(networkFee), "msg.value not equal to total fees");

        // handle platform fee
        feePerPlatformWallet[platformWallet] = feePerPlatformWallet[platformWallet].add(
            platformFee
        );
        totalPlatformFeeWei = totalPlatformFeeWei.add(platformFee);
        emit HandleFee(ETH_TOKEN_ADDRESS, platformWallet, platformFee, rebateWallets, rebateBpsPerWallet, networkFee);

        if (networkFee == 0) {
            emit FeeDistribution(
                ETH_TOKEN_ADDRESS,
                platformWallet,
                platformFee,
                0,
                0,
                rebateWallets,
                rebateBpsPerWallet,
                0
            );
            return;
        }

        (bool success, ) = address(this).call(
            abi.encodeWithSignature(
                "calculateAndRecordFeeData(address,uint256,address[],uint256[],uint256)",
                platformWallet,
                platformFee,
                rebateWallets,
                rebateBpsPerWallet,
                networkFee
            )
        );
        if (!success) {
            emit HandleFeeFailed(rebateWallets, rebateBpsPerWallet, networkFee);
        }
    }

    function calculateAndRecordFeeData(
        address platformWallet,
        uint256 platformFee,
        address[] calldata rebateWallets,
        uint256[] calldata rebateBpsPerWallet,
        uint256 feeBRRWei
    ) external virtual {
        require(msg.sender == address(this), "only Feehandler contract can call this function");
        BRRWei memory brrAmounts;

        brrAmounts.fullRebateWei = feeBRRWei.mul(rebateBps).div(BPS);
        brrAmounts.rewardWei = feeBRRWei.mul(rewardBps).div(BPS);

        brrAmounts.paidRebateWei = updateRebateValues(brrAmounts.fullRebateWei, rebateWallets, rebateBpsPerWallet);

        brrAmounts.rewardWei = brrAmounts.rewardWei.add(
            brrAmounts.fullRebateWei.sub(brrAmounts.paidRebateWei)
        );

        totalRewardWei = totalRewardWei.add(brrAmounts.rewardWei);

        uint burnAmountWei = feeBRRWei.sub(brrAmounts.rewardWei).sub(brrAmounts.paidRebateWei);

        emit FeeDistribution(
            ETH_TOKEN_ADDRESS,
            platformWallet,
            platformFee,
            brrAmounts.rewardWei,
            brrAmounts.paidRebateWei,
            rebateWallets,
            rebateBpsPerWallet,
            burnAmountWei
        );
    }

    /// @dev claim accumulated fee per platform wallet. Called by any address
    /// @param platformWallet the wallet to claim fee for. Total accumulated fee sent to this wallet.
    /// @return amountWei amount of fee claimed
    function claimPlatformFee(address platformWallet)
        external
        override
        nonReentrant
        returns (uint256 amountWei)
    {
        require(feePerPlatformWallet[platformWallet] > 1, "no fee to claim");
        // Get total amount of fees accumulated
        amountWei = feePerPlatformWallet[platformWallet].sub(1);

        // redundant check, but can't happen
        assert(totalPlatformFeeWei >= amountWei);
        totalPlatformFeeWei = totalPlatformFeeWei.sub(amountWei);

        feePerPlatformWallet[platformWallet] = 1; // avoid zero to non zero storage cost

        (bool success, ) = platformWallet.call{value: amountWei}("");
        require(success, "platform fee transfer failed");

        emit PlatformFeePaid(platformWallet, ETH_TOKEN_ADDRESS, amountWei);
        return amountWei;
    }

    function withdraw(address payable sendTo, uint256 amount) external nonReentrant {
        onlyAdmin();

        uint256 balance = address(this).balance;
        // check if the remain balance is enough for withdraw and paying platform fee
        require(amount <= balance.sub(totalPlatformFeeWei), "amount > available funds");

        (bool success, ) = sendTo.call{value: amount}("");
        require(success, "withdraw transfer failed");
        emit EtherWithdraw(amount, sendTo);
    }

    /// @dev claimReserveRebate is implemented for IKyberFeeHandler
    function claimReserveRebate(address) external override returns (uint256) {
        revert("not implemented");
    }

    /// @dev claimStakerReward is implemented for IKyberFeeHandler
    function claimStakerReward(address, uint256) external override returns (uint256) {
        revert("not implemented");
    }

    /// @dev set new kyberNetwork address by daoOperator
    /// @param _kyberNetwork new kyberNetwork contract
    function setNetworkContract(address _kyberNetwork) external {
        onlyAdmin();
        require(_kyberNetwork != address(0), "kyberNetwork 0");
        if (_kyberNetwork != kyberNetwork) {
            kyberNetwork = _kyberNetwork;
            emit KyberNetworkUpdated(kyberNetwork);
        }
    }

    function updateRebateValues(
        uint256 rebateWei,
        address[] memory rebateWallets,
        uint256[] memory rebateBpsPerWallet
    ) internal returns (uint256 totalRebatePaidWei) {
        uint256 totalRebateBps;
        uint256 walletRebateWei;

        for (uint256 i = 0; i < rebateWallets.length; i++) {
            require(rebateWallets[i] != address(0), "rebate wallet address 0");

            walletRebateWei = rebateWei.mul(rebateBpsPerWallet[i]).div(BPS);
            rebatePerWallet[rebateWallets[i]] = rebatePerWallet[rebateWallets[i]].add(
                walletRebateWei
            );

            // a few wei could be left out due to rounding down. so count only paid wei
            totalRebatePaidWei = totalRebatePaidWei.add(walletRebateWei);
            totalRebateBps = totalRebateBps.add(rebateBpsPerWallet[i]);
        }

        require(totalRebateBps <= BPS, "rebates more then 100%");
    }

}
