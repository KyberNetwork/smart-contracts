pragma solidity 0.5.11;

import "./WithdrawableV5.sol";
import "./UtilsV5.sol";
import "./IKyberNetwork.sol";
import "./IKyberNetworkProxy.sol";
import "./ISimpleKyberProxy.sol";
import "./IKyberHint.sol";


////////////////////////////////////////////////////////////////////////////////////////////////////////
/// @title Kyber Network proxy for main contract
contract KyberNetworkProxy is IKyberNetworkProxy, ISimpleKyberProxy, Withdrawable, Utils {

    IKyberNetwork public kyberNetwork;
    IKyberHint public hintHandler;
    
    mapping(address=>uint) platformWalletFeeBps;    

    constructor(address _admin) public Withdrawable(_admin) 
        {/*empty body*/}
    
    // backward compatible APIs
    function getExpectedRate(ERC20 src, ERC20 dest, uint srcQty) external view
        returns (uint expectedRate, uint worstRate)
    {
        bytes memory hint;    
        ( , expectedRate, ) = kyberNetwork.getExpectedRateWithHintAndFee(src, dest, srcQty, 0, hint);
        // use simple backward compatible optoin.
        worstRate = expectedRate * 97 / 100;
    }


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

    //todo: should we maintain backward compatible API
    function tradeWithHint(ERC20 src, uint srcAmount, ERC20 dest, address destAddress, uint maxDestAmount,
        uint minConversionRate, address walletId, bytes calldata hint) 
        external payable 
        returns(uint)
    {
        return tradeWithHintAndFee(src, srcAmount, dest, address(uint160(destAddress)), maxDestAmount, minConversionRate, 
            address(uint160(walletId)), 0, hint);
    }

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev makes a trade between src and dest token and send dest token to destAddress
    /// @param src Src token
    /// @param srcAmount amount of src tokens
    /// @param dest   Destination token
    /// @param destAddress Address to send tokens to
    /// @param maxDestAmount A limit on the amount of dest tokens
    /// @param minConversionRate The minimal conversion rate. If actual rate is lower, trade is canceled.
    /// @param platformWallet is the wallet ID to send part of the fees
    /// @return amount of actual dest tokens
    function trade(
        IERC20 src,
        uint srcAmount,
        IERC20 dest,
        address payable destAddress,
        uint maxDestAmount,
        uint minConversionRate,
        address payable platformWallet
    )
        public
        payable
        returns(uint)
    {
        bytes memory hint;

        return tradeWithHintAndFee(
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

    /// @dev makes a trade between src and dest token and send dest tokens to msg sender
    /// @param src Src token
    /// @param srcAmount amount of src tokens
    /// @param dest Destination token
    /// @param minConversionRate The minimal conversion rate. If actual rate is lower, trade is canceled.
    /// @return amount of actual dest tokens
    function swapTokenToToken(
        IERC20 src,
        uint srcAmount,
        IERC20 dest,
        uint minConversionRate
    )
        public
        returns(uint)
    {
        bytes memory hint;

        return tradeWithHintAndFee(
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

    /// @dev makes a trade from Ether to token. Sends token to msg sender
    /// @param token Destination token
    /// @param minConversionRate The minimal conversion rate. If actual rate is lower, trade is canceled.
    /// @return amount of actual dest tokens
    function swapEtherToToken(IERC20 token, uint minConversionRate) public payable returns(uint) {
        bytes memory hint;

        return tradeWithHintAndFee(
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

    /// @dev makes a trade from token to Ether, sends Ether to msg sender
    /// @param token Src token
    /// @param srcAmount amount of src tokens
    /// @param minConversionRate The minimal conversion rate. If actual rate is lower, trade is canceled.
    /// @return amount of actual dest tokens
    function swapTokenToEther(IERC20 token, uint srcAmount, uint minConversionRate) public returns(uint) {
        bytes memory hint;

        return tradeWithHintAndFee(
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

    // new APIs
    function getExpectedRateAfterFee(IERC20 src, IERC20 dest, uint srcQty, uint customFeeBps, bytes calldata hint) 
        external view
        returns (uint expectedRate)
    {
        ( , , expectedRate) = kyberNetwork.getExpectedRateWithHintAndFee(src, dest, srcQty, customFeeBps, hint);
    }
    
    function getPriceData(IERC20 src, IERC20 dest, uint srcQty) external view returns (uint priceNoFees)
    {
        bytes memory hint;    
        (priceNoFees, , ) = kyberNetwork.getExpectedRateWithHintAndFee(src, dest, srcQty, 0, hint);
    }
    
    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev makes a trade between src and dest token and send dest token to destAddress
    /// @param src Src token
    /// @param srcAmount amount of src tokens
    /// @param dest Destination token
    /// @param destAddress Address to send tokens to
    /// @param maxDestAmount A limit on the amount of dest tokens
    /// @param minConversionRate The minimal conversion rate. If actual rate is lower, trade is canceled.
    /// @param platformWallet is the wallet ID to send part of the fees
    /// @param hint will give hints for the trade.
    /// @return amount of actual dest tokens
    function tradeWithHintAndPlatformFee(
        IERC20 src,
        uint srcAmount,
        IERC20 dest,
        address payable destAddress,
        uint maxDestAmount,
        uint minConversionRate,
        address payable platformWallet,
        uint platformFeeBps,
        bytes calldata hint
    )
        external
        payable
        returns(uint destAmount)
    {
        return tradeWithHintAndFee(src, srcAmount, dest, destAddress, maxDestAmount, minConversionRate, platformWallet, platformFeeBps, hint);
    }
    
    struct UserBalance {
        uint srcBalance;
        uint destBalance;
    }

    event ExecuteTrade(address indexed trader, IERC20 src, IERC20 dest, uint actualSrcAmount, uint actualDestAmount);

    function tradeWithHintAndFee(
        IERC20 src,
        uint srcAmount,
        IERC20 dest,
        address payable destAddress,
        uint maxDestAmount,
        uint minConversionRate,
        address payable platformWallet,
        uint platformFeeBps,
        bytes memory hint
        ) 
        internal
        returns(uint)
    {
        (UserBalance memory userBalanceBefore) = 
            preapareTrade(src, dest, srcAmount, destAddress);

        (uint destAmount) = kyberNetwork.tradeWithHintAndFee.value(msg.value)(
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

        TradeOutcome memory tradeOutcome = finalizeTradeValidateOutcome(src, dest, destAddress, maxDestAmount, minConversionRate,
            platformFeeBps, userBalanceBefore, destAmount);

        return tradeOutcome.userDeltaDestToken;
            
    }
    
    event KyberNetworkSet(IKyberNetwork newNetwork, IKyberNetwork oldNetwork);

    function setKyberNetwork(IKyberNetwork _kyberNetwork) public onlyAdmin {

        require(_kyberNetwork != IKyberNetwork(0));

        emit KyberNetworkSet(_kyberNetwork, kyberNetwork);

        kyberNetwork = _kyberNetwork;
    }
    
    event HintHandlerSet(IKyberHint hintHandler);

    function setHintHandler(IKyberHint _hintHandler) public onlyAdmin {
        require(_hintHandler != IKyberHint(0), "Hint handler 0");

        emit HintHandlerSet(_hintHandler);

        hintHandler = _hintHandler;
    }
    
    function maxGasPrice() public view returns(uint gasPrice) {
        ( , , gasPrice, , ) = kyberNetwork.getNetworkData();
    }

    function enabled() public view returns(bool isEnabled) {
        ( isEnabled, , , , ) = kyberNetwork.getNetworkData();
    }

    struct TradeOutcome {
        uint userDeltaSrcToken;
        uint userDeltaDestToken;
        uint actualRate;
    }

    function calculateTradeOutcome (IERC20 src, IERC20 dest,
        address destAddress, uint platformFeeBps, UserBalance memory balanceBefore)
        internal returns(TradeOutcome memory outcome)
    {
        uint userSrcBalanceAfter;
        uint userDestBalanceAfter;

        userSrcBalanceAfter = getBalance(src, msg.sender);
        userDestBalanceAfter = getBalance(dest, destAddress);

        //protect from underflow
        require(userDestBalanceAfter > balanceBefore.destBalance);
        require(balanceBefore.srcBalance > userSrcBalanceAfter);

        outcome.userDeltaSrcToken = balanceBefore.srcBalance - userSrcBalanceAfter;
        outcome.userDeltaDestToken = userDestBalanceAfter - balanceBefore.destBalance;
        
        // what would be the dest amount if we didn't deduct platformFee
        uint srcTokenAmountAfterDeductingFee = outcome.userDeltaSrcToken * (BPS - platformFeeBps);
        
        outcome.actualRate = calcRateFromQty(
            srcTokenAmountAfterDeductingFee,
            outcome.userDeltaDestToken,
            getUpdateDecimals(src),
            getUpdateDecimals(dest)
        );
    }
    
    function preapareTrade(IERC20 src, IERC20 dest, uint srcAmount, address destAddress) 
        internal returns
        (UserBalance memory userBalanceBefore) 
    {
        require(src == ETH_TOKEN_ADDRESS || msg.value == 0);

        userBalanceBefore.srcBalance = getBalance(src, msg.sender);
        userBalanceBefore.destBalance = getBalance(dest, destAddress);

        if (src == ETH_TOKEN_ADDRESS) {
            userBalanceBefore.srcBalance += msg.value;
        } else {
            require(src.transferFrom(msg.sender, address(kyberNetwork), srcAmount), "allowance");
        }
    }
    
    function finalizeTradeValidateOutcome (IERC20 src, IERC20 dest, address destAddress, uint maxDestAmount, uint minConversionRate,
        uint platformFee, UserBalance memory balanceBefore, uint returnedDestAmount) 
        internal
        returns(TradeOutcome memory tradeOutcome)
    {
        tradeOutcome = calculateTradeOutcome(src, dest, destAddress, platformFee, balanceBefore);

        require(tradeOutcome.userDeltaDestToken == returnedDestAmount);
        require(tradeOutcome.userDeltaDestToken <= maxDestAmount);
        require(tradeOutcome.actualRate >= minConversionRate);

        emit ExecuteTrade(msg.sender, src, dest, tradeOutcome.userDeltaSrcToken, tradeOutcome.userDeltaDestToken);
    }
}
