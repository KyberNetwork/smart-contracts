pragma solidity 0.5.11;

import "./WithdrawableV5.sol";
import "./UtilsV5.sol";
import "./IKyberNetwork.sol";
import "./IKyberNetworkProxy.sol";
import "./ISimpleKyberProxy.sol";


////////////////////////////////////////////////////////////////////////////////////////////////////////
/// @title Kyber Network proxy for main contract
contract KyberNetworkProxy is IKyberNetworkProxy, ISimpleKyberProxy, Withdrawable, Utils {

    IKyberNetwork public kyberNetwork;
    
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

    function tradeWithHint(ERC20 src, uint srcAmount, ERC20 dest, address destAddress, uint maxDestAmount,
        uint minConversionRate, address walletId, bytes calldata hint) 
        external payable 
        returns(uint)
    {
        return doTrade(src, srcAmount, dest, address(uint160(destAddress)), maxDestAmount, minConversionRate, 
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

        return doTrade(
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

        return doTrade(
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

        return doTrade(
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

        return doTrade(
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
    
    function getPriceDataNoFees(IERC20 src, IERC20 dest, uint srcQty, bytes calldata hint) external view 
        returns (uint priceNoFee)
    {
        (priceNoFee, , ) = kyberNetwork.getExpectedRateWithHintAndFee(src, dest, srcQty, 0, hint);
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
    function tradeWithHintAndFee(
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
        return doTrade(src, srcAmount, dest, destAddress, maxDestAmount, minConversionRate, platformWallet, platformFeeBps, hint);
    }
    
    struct UserBalance {
        uint srcTok;
        uint destTok;
    }

    event ExecuteTrade(address indexed trader, IERC20 src, IERC20 dest, uint actualSrcAmount, uint actualDestAmount);

    function doTrade(
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
        (UserBalance memory balanceBefore) = 
            prepareTrade(src, dest, srcAmount, destAddress);

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
            platformFeeBps, balanceBefore, destAmount);

        return tradeOutcome.userDeltaDestToken;
            
    }
    
    event KyberNetworkSet(IKyberNetwork newNetwork, IKyberNetwork oldNetwork);

    function setKyberNetwork(IKyberNetwork _kyberNetwork) public onlyAdmin {

        require(_kyberNetwork != IKyberNetwork(0));

        emit KyberNetworkSet(_kyberNetwork, kyberNetwork);

        kyberNetwork = _kyberNetwork;
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
    
    function prepareTrade(IERC20 src, IERC20 dest, uint srcAmount, address destAddress) 
        internal returns
        (UserBalance memory balanceBefore) 
    {
        require(src == ETH_TOKEN_ADDRESS || msg.value == 0);

        balanceBefore.srcTok = getBalance(src, msg.sender);
        balanceBefore.destTok = getBalance(dest, destAddress);

        if (src == ETH_TOKEN_ADDRESS) {
            balanceBefore.srcTok += msg.value;
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

        require(tradeOutcome.userDeltaDestToken == returnedDestAmount, "wrong ret amount");
        require(tradeOutcome.userDeltaDestToken <= maxDestAmount, "Amount > maxDest");
        require(tradeOutcome.actualRate >= minConversionRate, "rate < minRate");
        
        emit ExecuteTrade(msg.sender, src, dest, tradeOutcome.userDeltaSrcToken, tradeOutcome.userDeltaDestToken);
    }

    function calculateTradeOutcome (IERC20 src, IERC20 dest,
        address destAddress, uint platformFeeBps, UserBalance memory balanceBefore)
        internal returns(TradeOutcome memory outcome)
    {
        uint srcTokenBalanceAfter;
        uint destTokenBalanceAfter;

        srcTokenBalanceAfter = getBalance(src, msg.sender);
        destTokenBalanceAfter = getBalance(dest, destAddress);

        //protect from underflow
        require(destTokenBalanceAfter > balanceBefore.destTok, "destAdd bad qty");
        require(balanceBefore.srcTok > srcTokenBalanceAfter, "srcAdd bad qty");

        outcome.userDeltaSrcToken = balanceBefore.srcTok - srcTokenBalanceAfter;
        outcome.userDeltaDestToken = destTokenBalanceAfter - balanceBefore.destTok;
        
        // what would be the src amount after deducting platformFee
        // not protecting from platform fee
        uint srcTokenAmountAfterDeductingFee = outcome.userDeltaSrcToken * (BPS - platformFeeBps) / BPS;
        
        outcome.actualRate = calcRateFromQty(
            srcTokenAmountAfterDeductingFee,
            outcome.userDeltaDestToken,
            getUpdateDecimals(src),
            getUpdateDecimals(dest)
        );
    }
}
