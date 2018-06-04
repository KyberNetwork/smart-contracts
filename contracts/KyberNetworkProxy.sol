pragma solidity 0.4.18;


import "./ERC20Interface.sol";
import "./Withdrawable.sol";
import "./Utils2.sol";
import "./PermissionGroups.sol";
import "./KyberReserveInterface.sol";
import "./KyberNetworkInterface.sol";


////////////////////////////////////////////////////////////////////////////////////////////////////////
/// @title Kyber Network Wrap main contract
contract KyberNetworkProxy is Withdrawable, Utils2 {

    KyberNetworkInterface public kyberNetworkContract;
    mapping(bytes32=>uint) public info; // this is only a UI field for external app.

    function KyberNetworkWrapper(address _admin) public {
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

    struct TradeOutcome {
        int userDeltaSource;
        int userDeltaDest;
        uint userMinExpectedDeltaDest;
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
        uint userSrcBalanceBefore;
        uint userDestBalanceBefore;

        uint sendVal = 0;

        userSrcBalanceBefore = getBalance(src, msg.sender);
        userDestBalanceBefore = getBalance(dest, destAddress);

        if (src == ETH_TOKEN_ADDRESS) {
            userSrcBalanceBefore += msg.value;
            sendVal = msg.value;
        } else {
            require(src.transferFrom(msg.sender, kyberNetworkContract, srcAmount));
        }

        kyberNetworkContract.tradeWithHint(
            msg.sender,
            src,
            srcAmount,
            dest,
            destAddress,
            maxDestAmount,
            minConversionRate,
            walletId,
            hint
        );

        TradeOutcome memory tradeOutcome =
            calculateTradeOutcome(userSrcBalanceBefore, userDestBalanceBefore, src, dest, destAddress, minConversionRate);

        require(tradeOutcome.userDeltaDest > 0);
        require(tradeOutcome.userDeltaDest >= int(tradeOutcome.userMinExpectedDeltaDest));

        ExecuteTrade(msg.sender, src, dest, uint(tradeOutcome.userDeltaSource), uint(tradeOutcome.userDeltaDest));
        return uint(tradeOutcome.userDeltaDest);
    }

    function calculateTradeOutcome (uint srcBalanceBefore, uint destBalanceBefore, ERC20 src, ERC20 dest,
        address destAddress, uint minConversionRate)
        internal returns(TradeOutcome outcome)
    {
        uint userSrcBalanceAfter;
        uint userDestBalanceAfter;
        userSrcBalanceAfter = getBalance(src, msg.sender);
        userDestBalanceAfter = getBalance(dest, destAddress);

        outcome.userDeltaDest = int(userDestBalanceAfter - destBalanceBefore);
        outcome.userDeltaSource = int(srcBalanceBefore - userSrcBalanceAfter);

        require(outcome.userDeltaSource > 0);

        outcome.userMinExpectedDeltaDest =
            calcDstQty(uint(outcome.userDeltaSource), decimalGetterSetter(src), decimalGetterSetter(dest), minConversionRate);
    }

    function validateNoUserLoss(uint srcBalanceBefore, uint destBalanceBefore, ERC20 src, ERC20 dest,
        address destAddress, uint minConversionRate)
        internal view returns(bool userLos)
    {
        uint userSrcBalanceAfter;
        uint userDestBalanceAfter;
        userSrcBalanceAfter = getBalance(src, msg.sender);
        userDestBalanceAfter = getBalance(dest, destAddress);

        if(userSrcBalanceAfter >= srcBalanceBefore) return false;
        if(userDestBalanceAfter <= destBalanceBefore) return false;

        if ((userDestBalanceAfter - destBalanceBefore) <
            calcDstQty((srcBalanceBefore - userSrcBalanceAfter), getDecimals(src), getDecimals(dest),
                minConversionRate))
            return false;

        return true;
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
        returns (uint expectedRate, uint slippageRate)
    {
        return kyberNetworkContract.getExpectedRate(src, dest, srcQty);
    }

    function getUserCapInWei(address user) public view returns(uint) {
        return kyberNetworkContract.getUserCapInWei(user);
    }

    function getUserCapInTokenWei(address user, ERC20 token) public view returns(uint) {
        return kyberNetworkContract.getUserCapInTokenWei(user, token);
    }

    function maxGasPrice() public view returns (uint) {
        return kyberNetworkContract.getMaxGasPriceWei();
    }

    function enabled() public view returns (bool) {
        return kyberNetworkContract.isEnabled();
    }

    function info(bytes32 id) public view returns(uint) {
        kyberNetworkContract.getInfo(id);
    }

    /// @dev get the balance of a user.
    /// @param token The token type
    /// @return The balance
    function getBalance(ERC20 token, address user) public view returns(uint) {
        if (token == ETH_TOKEN_ADDRESS)
            return user.balance;
        else
            return token.balanceOf(user);
    }
}