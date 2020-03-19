pragma solidity 0.5.11;

import "./utils/Withdrawable2.sol";
import "./utils/Utils4.sol";
import "./utils/zeppelin/SafeERC20.sol";
import "./IKyberNetwork.sol";
import "./IKyberNetworkProxy.sol";
import "./ISimpleKyberProxy.sol";
import "./IKyberHint.sol";


////////////////////////////////////////////////////////////////////////////////////////////////////////
/// @title Kyber Network proxy for main contract
contract KyberNetworkProxy is IKyberNetworkProxy, ISimpleKyberProxy, Withdrawable2, Utils4 {
    using SafeERC20 for IERC20;

    IKyberNetwork public kyberNetwork;
    IKyberHint public hintHandler; // hint handler pointer for users.
    
    constructor(address _admin) public Withdrawable2(_admin) 
        {/*empty body*/}
    
    /// @notice backward compatible API
    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev trade from src to dest token and sends dest token to destAddress
    /// @param src Src token
    /// @param srcAmount amount of src tokens in twei
    /// @param dest Destination token
    /// @param destAddress Address to send tokens to
    /// @param maxDestAmount A limit on the amount of dest tokens in twei
    /// @param minConversionRate The minimal conversion rate. If actual rate is lower, trade is canceled.
    /// @param walletId is the wallet ID to send part of the fees
    /// @param hint defines which reserves should be used for this trade.
    /// @return amount of actual dest tokens in twei
    function tradeWithHint(ERC20 src, uint srcAmount, ERC20 dest, address destAddress, uint maxDestAmount,
        uint minConversionRate, address walletId, bytes calldata hint) 
        external payable 
        returns(uint)
    {
        return doTrade(src, srcAmount, dest, address(uint160(destAddress)), maxDestAmount, minConversionRate, 
            address(uint160(walletId)), 0, hint);
    }

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev trade from src to dest token and sends dest token to destAddress
    /// @param src Src token
    /// @param srcAmount amount of src tokens in twei
    /// @param dest   Destination token
    /// @param destAddress Address to send tokens to
    /// @param maxDestAmount A limit on the amount of dest tokens in twei
    /// @param minConversionRate The minimal conversion rate. If actual rate is lower, trade is canceled.
    /// @param platformWallet is the wallet ID to send part of the fees
    /// @return amount of actual dest tokens in twei
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

    /// @dev trade from src to dest token and sends dest tokens to msg sender
    /// @param src Src token
    /// @param srcAmount amount of src tokens in twei
    /// @param dest Destination token
    /// @param minConversionRate The minimal conversion rate. If actual rate is lower, trade is canceled.
    /// @return amount of actual dest tokens in twei
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

    /// @dev trades fromEther to token. Sends token to msg sender
    /// @param token Destination token
    /// @param minConversionRate The minimal conversion rate. If actual rate is lower, trade is canceled.
    /// @return amount of actual dest tokens in twei
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

    /// @dev trades fromtoken to Ether, sends Ether to msg sender
    /// @param token Src token
    /// @param srcAmount amount of src tokens in twei
    /// @param minConversionRate The minimal conversion rate. If actual rate is lower, trade is canceled.
    /// @return amount of actual dest tokens in twei
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

    /// @notice backward compatible API
    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev get expected rate for a trade from src to dest tokens, with amount srcQty
    /// @param src Src token
    /// @param dest Destination token
    /// @param srcQty amount of src tokens in twei
    /// @return expectedRate for a trade after deducting network fee. Rate = destQty (twei) / srcQty (twei) * 10 ** 18
    /// @return worstRate for a trade. Usually expectedRate * 97 / 100. 
    ///             Use worstRate value as trade min conversion rate at your own risk.
    function getExpectedRate(ERC20 src, ERC20 dest, uint srcQty) external view
        returns (uint expectedRate, uint worstRate)
    {
        bytes memory hint;    
        ( , expectedRate, ) = kyberNetwork.getExpectedRateWithHintAndFee(src, dest, srcQty, 0, hint);
        // use simple backward compatible optoin.
        worstRate = expectedRate * 97 / 100;
    }

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev get expected rate for a trade from src to dest tokens, with amount srcQty and custom fee
    /// @param src Src token
    /// @param dest Destination token
    /// @param srcQty amount of src tokens in twei
    /// @param customFeeBps part of the trade that will be sent as fee to platform wallet. Ex: 10000 = 100%, 100 = 1%
    /// @param hint to define which reserves should be used for a trade.
    /// @return expectedRate for a trade after deducting network + platform fee. 
    ///             Rate = destQty (twei) / srcQty (twei) * 10 ** 18
    function getExpectedRateAfterFee(IERC20 src, IERC20 dest, uint srcQty, uint customFeeBps, bytes calldata hint) 
        external view
        returns (uint expectedRate)
    {
        ( , , expectedRate) = kyberNetwork.getExpectedRateWithHintAndFee(src, dest, srcQty, customFeeBps, hint);
    }

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev get expected rate for a trade from src to dest tokens, with amount srcQty
    /// @param src Src token
    /// @param dest Destination token
    /// @param srcQty amount of src tokens in twei
    /// @param hint define which reserves should be used for this trade.
    /// @return expectedRate for a trade without deducting any fees, network or platform fee. 
    ///             Rate = destQty (twei) / srcQty (twei) * 10 ** 18
    function getPriceDataNoFees(IERC20 src, IERC20 dest, uint srcQty, bytes calldata hint) external view 
        returns (uint priceNoFee)
    {
        (priceNoFee, , ) = kyberNetwork.getExpectedRateWithHintAndFee(src, dest, srcQty, 0, hint);
    }
    
    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev trade from src to dest token and sends dest token to destAddress
    /// @param src Src token
    /// @param srcAmount amount of src tokens in twei
    /// @param dest Destination token
    /// @param destAddress Address to send tokens to
    /// @param maxDestAmount A limit on the amount of dest tokens in twei
    /// @param minConversionRate The minimal conversion rate. If actual rate is lower, trade reverted.
    /// @param platformWallet is the platform wallet address to send fees too
    /// @param platformFeeBps Percentage of trade to be allocated as platform fee. Ex: 10000 = 100%, 100 = 1%
    /// @param hint define which reserves should be used for this trade.
    /// @return amount of actual dest tokens in twei
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
        return doTrade(src, srcAmount, dest, destAddress, maxDestAmount, minConversionRate, platformWallet, 
            platformFeeBps, hint);
    }
    
    struct UserBalance {
        uint srcTok;
        uint destTok;
    }

    event ExecuteTrade(address indexed trader, IERC20 src, IERC20 dest, uint actualSrcAmount, uint actualDestAmount,
        address platformWallet, uint platformFeeBps);

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
        UserBalance memory balanceBefore = prepareTrade(src, dest, srcAmount, destAddress);

        uint reportedDestAmount = kyberNetwork.tradeWithHintAndFee.value(msg.value)(
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

        TradeOutcome memory tradeOutcome = calculateTradeOutcome(src, dest, destAddress, platformFeeBps, balanceBefore);

        require(tradeOutcome.userDeltaDestToken == reportedDestAmount, "Kyber network returned wrong amount");
        require(tradeOutcome.userDeltaDestToken <= maxDestAmount, "Destination amount bigger then max destination amount");
        require(tradeOutcome.actualRate >= minConversionRate, "rate < minRate");

        emit ExecuteTrade(msg.sender, src, dest, tradeOutcome.userDeltaSrcToken, tradeOutcome.userDeltaDestToken,
            platformWallet, platformFeeBps);

        return tradeOutcome.userDeltaDestToken;
    }
    
    event KyberNetworkSet(IKyberNetwork newNetwork, IKyberNetwork oldNetwork);

    function setKyberNetwork(IKyberNetwork _kyberNetwork) public onlyAdmin {
        require(_kyberNetwork != IKyberNetwork(0), "KyberNetwork 0");
        emit KyberNetworkSet(_kyberNetwork, kyberNetwork);

        kyberNetwork = _kyberNetwork;
    }
    
    event HintHandlerSet(IKyberHint hintHandler);

    function setHintHandler(IKyberHint _hintHandler) public onlyAdmin {
        require(_hintHandler != IKyberHint(0), "Hint handler 0");
        emit HintHandlerSet(_hintHandler);

        hintHandler = _hintHandler;
    }
    
    function maxGasPrice() public view returns(uint) {
        return kyberNetwork.maxGasPrice();
    }

    function enabled() public view returns(bool) {
        return kyberNetwork.enabled();
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
        require(src == ETH_TOKEN_ADDRESS || msg.value == 0, "msg.value should be 0");

        balanceBefore.srcTok = getBalance(src, msg.sender);
        balanceBefore.destTok = getBalance(dest, destAddress);

        if (src == ETH_TOKEN_ADDRESS) {
            balanceBefore.srcTok += msg.value;
        } else {
            src.safeTransferFrom(msg.sender, address(kyberNetwork), srcAmount);
        }
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
        require(destTokenBalanceAfter > balanceBefore.destTok, "Wrong amount in destination address");
        require(balanceBefore.srcTok > srcTokenBalanceAfter, "Wrong amount in source address");

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
