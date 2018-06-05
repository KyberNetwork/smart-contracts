pragma solidity 0.4.18;


import "./ERC20Interface.sol";
import "./Withdrawable.sol";
import "./Utils2.sol";
import "./PermissionGroups.sol";
import "./KyberReserveInterface.sol";
import "./KyberNetworkInterface.sol";
import "./KyberNetworkProxyInterface.sol";


////////////////////////////////////////////////////////////////////////////////////////////////////////
/// @title Kyber Network proxy for main contract
contract KyberNetworkProxy is KyberNetworkProxyInterface, Withdrawable, Utils2 {

    KyberNetworkInterface public kyberNetworkContract;

    function KyberNetworkProxy(address _admin) public {
        require(_admin != address(0));
        admin = _admin;
    }

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev makes a trade between src and dest token and send dest token to destAddress
    /// @param src Src token
    /// @param srcAmount amount of src tokens
    /// @param dest   Destination token
    /// @param destAddress Address to send tokens to
    /// @param maxDestAmount A limit on the amount of dest tokens
    /// @param minConversionRate The minimal conversion rate. If actual rate is lower, trade is canceled.
    /// @param walletId is the wallet ID to send part of the fees
    /// @return amount of actual dest tokens
    function trade(
        ERC20 src,
        uint srcAmount,
        ERC20 dest,
        address destAddress,
        uint maxDestAmount,
        uint minConversionRate,
        address walletId
    )
        public
        payable
        returns(uint)
    {
        bytes memory hint;

        return tradeWithHint(
            src,
            srcAmount,
            dest,
            destAddress,
            maxDestAmount,
            minConversionRate,
            walletId,
            hint
        );
    }

    event ExecuteTrade(address indexed trader, ERC20 src, ERC20 dest, uint actualSrcAmount, uint actualDestAmount);
    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev makes a trade between src and dest token and send dest token to destAddress
    /// @param src Src token
    /// @param srcAmount amount of src tokens
    /// @param dest Destination token
    /// @param destAddress Address to send tokens to
    /// @param maxDestAmount A limit on the amount of dest tokens
    /// @param minConversionRate The minimal conversion rate. If actual rate is lower, trade is canceled.
    /// @param walletId is the wallet ID to send part of the fees
    /// @param hint will give hints for the trade.
    /// @return amount of actual dest tokens
    function tradeWithHint(
        ERC20 src,
        uint srcAmount,
        ERC20 dest,
        address destAddress,
        uint maxDestAmount,
        uint minConversionRate,
        address walletId,
        bytes hint
    )
        public
        payable
        returns(uint)
    {
        TradeInput memory tradeInput;
        tradeInput.src = src;
        tradeInput.srcAmount = srcAmount;
        tradeInput.dest = dest;
        tradeInput.destAddress = destAddress;
        tradeInput.maxDestAmount = maxDestAmount;
        tradeInput.minConversionRate = minConversionRate;
        tradeInput.walletId = walletId;
        tradeInput.hint = hint;

        return doTrade(tradeInput);
    }

    event KyberNetworkSet(address newNetworkContract, address oldNetworkContract);
    function setKyberNetworkContract(
        KyberNetworkInterface _kyberNetworkContract
    )
        public
        onlyAdmin
    {
        require(_kyberNetworkContract != address(0));
        KyberNetworkSet(_kyberNetworkContract, kyberNetworkContract);
        kyberNetworkContract = _kyberNetworkContract;
    }

    function getExpectedRate(ERC20 src, ERC20 dest, uint srcQty)
        public view
        returns(uint expectedRate, uint slippageRate)
    {
        return kyberNetworkContract.getExpectedRate(src, dest, srcQty);
    }

    function getUserCapInWei(address user) public view returns(uint) {
        return kyberNetworkContract.getUserCapInWei(user);
    }

    function getUserCapInTokenWei(address user, ERC20 token) public view returns(uint) {
        return kyberNetworkContract.getUserCapInTokenWei(user, token);
    }

    function maxGasPrice() public view returns(uint) {
        return kyberNetworkContract.maxGasPrice();
    }

    function enabled() public view returns(bool) {
        return kyberNetworkContract.enabled();
    }

    function info(bytes32 id) public view returns(uint) {
        kyberNetworkContract.info(id);
    }

    struct TradeInput {
        ERC20 src;
        uint srcAmount;
        ERC20 dest;
        address destAddress;
        uint maxDestAmount;
        uint minConversionRate;
        address walletId;
        bytes hint;
    }

    struct UserBalance {
        uint srcBalance;
        uint destBalance;
    }

    function doTrade(TradeInput tradeInput) internal returns(uint) {

        UserBalance memory userBalanceBefore;

        userBalanceBefore.srcBalance = getBalance(tradeInput.src, msg.sender);
        userBalanceBefore.destBalance = getBalance(tradeInput.dest, tradeInput.destAddress);

        uint amount = 0;

        if (tradeInput.src == ETH_TOKEN_ADDRESS) {
            userBalanceBefore.srcBalance += msg.value;
            amount = msg.value;
        } else {
            require(tradeInput.src.transferFrom(msg.sender, kyberNetworkContract, tradeInput.srcAmount));
        }

        amount = kyberNetworkContract.tradeWithHint.value(amount)(
            msg.sender,
            tradeInput.src,
            tradeInput.srcAmount,
            tradeInput.dest,
            tradeInput.destAddress,
            tradeInput.maxDestAmount,
            tradeInput.minConversionRate,
            tradeInput.walletId,
            tradeInput.hint
        );

        TradeOutcome memory tradeOutcome = calculateTradeOutcome(
            userBalanceBefore.srcBalance,
            userBalanceBefore.destBalance,
            tradeInput.src,
            tradeInput.dest,
            tradeInput.destAddress,
            tradeInput.minConversionRate
            );

        require(amount == tradeOutcome.userDeltaDestAmount);
        require(tradeOutcome.userDeltaDestAmount >= tradeOutcome.userMinExpectedDeltaDestAmount);

        ExecuteTrade(msg.sender, tradeInput.src, tradeInput.dest, tradeOutcome.userDeltaSrcAmount, tradeOutcome.userDeltaDestAmount);
        return tradeOutcome.userDeltaDestAmount;
    }

    struct TradeOutcome {
        uint userDeltaSrcAmount;
        uint userDeltaDestAmount;
        uint userMinExpectedDeltaDestAmount;
    }

    function calculateTradeOutcome (uint srcBalanceBefore, uint destBalanceBefore, ERC20 src, ERC20 dest,
        address destAddress, uint minConversionRate)
        internal returns(TradeOutcome outcome)
    {
        uint userSrcBalanceAfter;
        uint userDestBalanceAfter;

        userSrcBalanceAfter = getBalance(src, msg.sender);
        userDestBalanceAfter = getBalance(dest, destAddress);

        outcome.userDeltaDestAmount = userDestBalanceAfter - destBalanceBefore;
        outcome.userDeltaSrcAmount = srcBalanceBefore - userSrcBalanceAfter;

        //make sure no overflow
        require(outcome.userDeltaDestAmount <= userDestBalanceAfter);
        require(outcome.userDeltaSrcAmount <= srcBalanceBefore);

        outcome.userMinExpectedDeltaDestAmount =
            calcDstQty(outcome.userDeltaSrcAmount, getDecimalsSafe(src), getDecimalsSafe(dest), minConversionRate);
    }
}
