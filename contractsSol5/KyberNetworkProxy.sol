pragma solidity 0.5.11;

import "./utils/WithdrawableNoModifiers.sol";
import "./utils/Utils4.sol";
import "./utils/zeppelin/SafeERC20.sol";
import "./IKyberNetwork.sol";
import "./IKyberNetworkProxy.sol";
import "./ISimpleKyberProxy.sol";
import "./IKyberHint.sol";


/**
 *   @title Kyber Network proxy for network contract
 *   The contract provides the following functions:
 *   - Get rates
 *   - Trade execution
 *   - Simple T2E, E2T and T2T trade APIs
 *   - Has some checks in place to safeguard takers
 */
contract KyberNetworkProxy is
    IKyberNetworkProxy,
    ISimpleKyberProxy,
    WithdrawableNoModifiers,
    Utils4
{
    using SafeERC20 for IERC20;

    IKyberNetwork public kyberNetwork;
    IKyberHint public hintHandler; // hint handler pointer for users.

    event KyberNetworkSet(IKyberNetwork newNetwork, IKyberNetwork oldNetwork);
    event HintHandlerSet(IKyberHint hintHandler);

    constructor(address _admin) public WithdrawableNoModifiers(_admin) {
        /*empty body*/
    }

    /// @notice Backward compatible function
    /// @notice Use token address ETH_TOKEN_ADDRESS for ether
    /// @dev Trade from src to dest token and sends dest token to destAddress
    /// @param src Source token
    /// @param srcAmount Amount of src tokens in twei
    /// @param dest Destination token
    /// @param destAddress Address to send tokens to
    /// @param maxDestAmount A limit on the amount of dest tokens in twei
    /// @param minConversionRate The minimal conversion rate. If actual rate is lower, trade reverts
    /// @param platformWallet Wallet address to receive a portion of the fees collected
    /// @return Amount of actual dest tokens in twei
    function trade(
        IERC20 src,
        uint256 srcAmount,
        IERC20 dest,
        address payable destAddress,
        uint256 maxDestAmount,
        uint256 minConversionRate,
        address payable platformWallet
    ) external payable returns (uint256) {
        bytes memory hint;

        return
            doTrade(
                src,
                srcAmount,
                dest,
                destAddress,
                maxDestAmount,
                minConversionRate,
                platformWallet,
                0,
                hint
            );
    }

    /// @notice Backward compatible function
    /// @notice Use token address ETH_TOKEN_ADDRESS for ether
    /// @dev Trade from src to dest token and sends dest token to destAddress
    /// @param src Source token
    /// @param srcAmount Amount of src tokens in twei
    /// @param dest Destination token
    /// @param destAddress Address to send tokens to
    /// @param maxDestAmount A limit on the amount of dest tokens in twei
    /// @param minConversionRate The minimal conversion rate. If actual rate is lower, trade reverts
    /// @param walletId Wallet address to receive a portion of the fees collected
    /// @param hint Defines which reserves should be used for the trade
    /// @return Amount of actual dest tokens in twei
    function tradeWithHint(
        ERC20 src,
        uint256 srcAmount,
        ERC20 dest,
        address destAddress,
        uint256 maxDestAmount,
        uint256 minConversionRate,
        address walletId,
        bytes calldata hint
    ) external payable returns (uint256) {
        return
            doTrade(
                src,
                srcAmount,
                dest,
                address(uint160(destAddress)),
                maxDestAmount,
                minConversionRate,
                address(uint160(walletId)),
                0,
                hint
            );
    }

    /// @notice Use token address ETH_TOKEN_ADDRESS for ether
    /// @dev Trade from src to dest token and sends dest token to destAddress
    /// @param src Source token
    /// @param srcAmount Amount of src tokens in twei
    /// @param dest Destination token
    /// @param destAddress Address to send tokens to
    /// @param maxDestAmount A limit on the amount of dest tokens in twei
    /// @param minConversionRate The minimal conversion rate. If actual rate is lower, trade reverts
    /// @param platformWallet Wallet address to receive a portion of the fees collected
    /// @param platformFeeBps Part of the trade that is allocated as fee to platform wallet. Ex: 10000 = 100%, 100 = 1%
    /// @param hint Defines which reserves should be used for the trade
    /// @return Amount of actual dest tokens in twei
    function tradeWithHintAndFee(
        IERC20 src,
        uint256 srcAmount,
        IERC20 dest,
        address payable destAddress,
        uint256 maxDestAmount,
        uint256 minConversionRate,
        address payable platformWallet,
        uint256 platformFeeBps,
        bytes calldata hint
    ) external payable returns (uint256 destAmount) {
        return
            doTrade(
                src,
                srcAmount,
                dest,
                destAddress,
                maxDestAmount,
                minConversionRate,
                platformWallet,
                platformFeeBps,
                hint
            );
    }

    /// @dev Trade from src to dest token. Sends dest tokens to msg sender
    /// @param src Source token
    /// @param srcAmount Amount of src tokens in twei
    /// @param dest Destination token
    /// @param minConversionRate The minimal conversion rate. If actual rate is lower, trade reverts
    /// @return Amount of actual dest tokens in twei
    function swapTokenToToken(
        IERC20 src,
        uint256 srcAmount,
        IERC20 dest,
        uint256 minConversionRate
    ) external returns (uint256) {
        bytes memory hint;

        return
            doTrade(
                src,
                srcAmount,
                dest,
                msg.sender,
                MAX_QTY,
                minConversionRate,
                address(0),
                0,
                hint
            );
    }

    /// @dev Trade from ether to token. Sends token to msg sender
    /// @param token Destination token
    /// @param minConversionRate The minimal conversion rate. If actual rate is lower, trade reverts
    /// @return Amount of actual dest tokens in twei
    function swapEtherToToken(IERC20 token, uint256 minConversionRate)
        external
        payable
        returns (uint256)
    {
        bytes memory hint;

        return
            doTrade(
                ETH_TOKEN_ADDRESS,
                msg.value,
                token,
                msg.sender,
                MAX_QTY,
                minConversionRate,
                address(0),
                0,
                hint
            );
    }

    /// @dev Trade from token to ether. Sends ether to msg sender
    /// @param token Source token
    /// @param srcAmount Amount of src tokens in twei
    /// @param minConversionRate The minimal conversion rate. If actual rate is lower, trade reverts
    /// @return Amount of actual dest tokens in twei
    function swapTokenToEther(
        IERC20 token,
        uint256 srcAmount,
        uint256 minConversionRate
    ) external returns (uint256) {
        bytes memory hint;

        return
            doTrade(
                token,
                srcAmount,
                ETH_TOKEN_ADDRESS,
                msg.sender,
                MAX_QTY,
                minConversionRate,
                address(0),
                0,
                hint
            );
    }

    function setKyberNetwork(IKyberNetwork _kyberNetwork) external {
        onlyAdmin();
        require(_kyberNetwork != IKyberNetwork(0), "KyberNetwork 0");
        emit KyberNetworkSet(_kyberNetwork, kyberNetwork);

        kyberNetwork = _kyberNetwork;
    }

    function setHintHandler(IKyberHint _hintHandler) external {
        onlyAdmin();
        require(_hintHandler != IKyberHint(0), "hintHandler 0");
        emit HintHandlerSet(_hintHandler);

        hintHandler = _hintHandler;
    }

    /// @notice Backward compatible function
    /// @notice Use token address ETH_TOKEN_ADDRESS for ether
    /// @dev Get expected rate for a trade from src to dest tokens, with amount srcQty
    /// @param src Source token
    /// @param dest Destination token
    /// @param srcQty Amount of src tokens in twei
    /// @return expectedRate for a trade after deducting network fee. Rate = destQty (twei) / srcQty (twei) * 10 ** 18
    /// @return worstRate for a trade. Usually expectedRate * 97 / 100
    ///             Use worstRate value as trade min conversion rate at your own risk
    function getExpectedRate(
        ERC20 src,
        ERC20 dest,
        uint256 srcQty
    ) external view returns (uint256 expectedRate, uint256 worstRate) {
        bytes memory hint;
        (, expectedRate, ) = kyberNetwork.getExpectedRateWithHintAndFee(
            src,
            dest,
            srcQty,
            0,
            hint
        );
        // use simple backward compatible optoin.
        worstRate = (expectedRate * 97) / 100;
    }

    /// @notice Use token address ETH_TOKEN_ADDRESS for ether
    /// @dev Get expected rate for a trade from src to dest tokens, with amount srcQty and custom fee
    /// @param src Source token
    /// @param dest Destination token
    /// @param srcQty Amount of src tokens in twei
    /// @param platformFeeBps Part of the trade that is allocated as fee to platform wallet. Ex: 10000 = 100%, 100 = 1%
    /// @param hint Defines which reserves should be used for the trade
    /// @return expectedRate for a trade after deducting network + platform fee
    ///             Rate = destQty (twei) / srcQty (twei) * 10 ** 18
    function getExpectedRateAfterFee(
        IERC20 src,
        IERC20 dest,
        uint256 srcQty,
        uint256 platformFeeBps,
        bytes calldata hint
    ) external view returns (uint256 expectedRate) {
        (, , expectedRate) = kyberNetwork.getExpectedRateWithHintAndFee(
            src,
            dest,
            srcQty,
            platformFeeBps,
            hint
        );
    }

    /// @notice Use token address ETH_TOKEN_ADDRESS for ether
    /// @dev Get expected rate for a trade from src to dest tokens, with amount srcQty
    /// @param src Source token
    /// @param dest Destination token
    /// @param srcQty Amount of src tokens in twei
    /// @param hint Defines which reserves should be used for the trade
    /// @return priceNoFee for a trade without deducting any fees, network or platform fee
    ///             Rate = destQty (twei) / srcQty (twei) * 10 ** 18
    function getPriceDataNoFees(
        IERC20 src,
        IERC20 dest,
        uint256 srcQty,
        bytes calldata hint
    ) external view returns (uint256 priceNoFee) {
        (priceNoFee, , ) = kyberNetwork.getExpectedRateWithHintAndFee(src, dest, srcQty, 0, hint);
    }

    function maxGasPrice() external view returns (uint256) {
        return kyberNetwork.maxGasPrice();
    }

    function enabled() external view returns (bool) {
        return kyberNetwork.enabled();
    }

    /// helper structure for function doTrade
    struct UserBalance {
        uint256 srcTok;
        uint256 destTok;
    }

    function doTrade(
        IERC20 src,
        uint256 srcAmount,
        IERC20 dest,
        address payable destAddress,
        uint256 maxDestAmount,
        uint256 minConversionRate,
        address payable platformWallet,
        uint256 platformFeeBps,
        bytes memory hint
    ) internal returns (uint256) {
        UserBalance memory balanceBefore = prepareTrade(src, dest, srcAmount, destAddress);

        uint256 reportedDestAmount = kyberNetwork.tradeWithHintAndFee.value(msg.value)(
            msg.sender,
            src,
            srcAmount,
            dest,
            destAddress,
            maxDestAmount,
            minConversionRate,
            platformWallet,
            platformFeeBps,
            hint
        );
        TradeOutcome memory tradeOutcome = calculateTradeOutcome(
            src,
            dest,
            destAddress,
            platformFeeBps,
            balanceBefore
        );

        require(
            tradeOutcome.userDeltaDestToken == reportedDestAmount,
            "network returned wrong amount"
        );
        require(
            tradeOutcome.userDeltaDestToken <= maxDestAmount,
            "actual dest amount exceeds maxDestAmount"
        );
        require(tradeOutcome.actualRate >= minConversionRate, "rate below minConversionRate");

        emit ExecuteTrade(
            msg.sender,
            src,
            dest,
            tradeOutcome.userDeltaSrcToken,
            tradeOutcome.userDeltaDestToken,
            platformWallet,
            platformFeeBps
        );

        return tradeOutcome.userDeltaDestToken;
    }

    /// helper structur for function prepareTrade
    struct TradeOutcome {
        uint256 userDeltaSrcToken;
        uint256 userDeltaDestToken;
        uint256 actualRate;
    }

    function prepareTrade(
        IERC20 src,
        IERC20 dest,
        uint256 srcAmount,
        address destAddress
    ) internal returns (UserBalance memory balanceBefore) {
        require(src == ETH_TOKEN_ADDRESS || msg.value == 0, "msg.value should be 0");

        balanceBefore.srcTok = getBalance(src, msg.sender);
        balanceBefore.destTok = getBalance(dest, destAddress);

        if (src == ETH_TOKEN_ADDRESS) {
            balanceBefore.srcTok += msg.value;
        } else {
            src.safeTransferFrom(msg.sender, address(kyberNetwork), srcAmount);
        }
    }

    function calculateTradeOutcome(
        IERC20 src,
        IERC20 dest,
        address destAddress,
        uint256 platformFeeBps,
        UserBalance memory balanceBefore
    ) internal returns (TradeOutcome memory outcome) {
        uint256 srcTokenBalanceAfter;
        uint256 destTokenBalanceAfter;

        srcTokenBalanceAfter = getBalance(src, msg.sender);
        destTokenBalanceAfter = getBalance(dest, destAddress);

        //protect from underflow
        require(
            destTokenBalanceAfter > balanceBefore.destTok,
            "wrong amount in destination address"
        );
        require(balanceBefore.srcTok > srcTokenBalanceAfter, "wrong amount in source address");

        outcome.userDeltaSrcToken = balanceBefore.srcTok - srcTokenBalanceAfter;
        outcome.userDeltaDestToken = destTokenBalanceAfter - balanceBefore.destTok;

        // what would be the src amount after deducting platformFee
        // not protecting from platform fee
        uint256 srcTokenAmountAfterDeductingFee = (outcome.userDeltaSrcToken *
            (BPS - platformFeeBps)) / BPS;

        outcome.actualRate = calcRateFromQty(
            srcTokenAmountAfterDeductingFee,
            outcome.userDeltaDestToken,
            getUpdateDecimals(src),
            getUpdateDecimals(dest)
        );
    }
}
