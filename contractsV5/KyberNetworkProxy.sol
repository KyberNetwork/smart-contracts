pragma solidity 0.5.11;

import "./WithdrawableV5.sol";
import "./UtilsV5.sol";
import "./IKyberNetwork.sol";
import "./IKyberNetworkProxy.sol";
import "./ISimpleKyberProxy.sol";


////////////////////////////////////////////////////////////////////////////////////////////////////////
/// @title Kyber Network proxy for main contract
contract KyberNetworkProxy is IKyberNetworkProxy, ISimpleKyberProxy, Withdrawable, Utils {

    IKyberNetwork public kyberNetworkContract;

    constructor(address _admin) public {
        require(_admin != address(0), "Proxy: admin 0 address not allowed");
        admin = _admin;
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
        returns(uint)
    {
        return tradeWithHintAndFee(src, srcAmount, dest, destAddress, maxDestAmount, minConversionRate, platformWallet, platformFeeBps, hint);
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
        bytes memory hint;
        return tradeWithHintAndFee(src, srcAmount, dest, address(uint160(destAddress)), maxDestAmount, minConversionRate, 
            address(uint160(walletId)), 0, hint);
    }

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
        require(src == ETH_TOKEN_ADDRESS || msg.value == 0);

        UserBalance memory userBalanceBefore;

        userBalanceBefore.srcBalance = getBalance(src, msg.sender);
        userBalanceBefore.destBalance = getBalance(dest, destAddress);

        if (src == ETH_TOKEN_ADDRESS) {
            userBalanceBefore.srcBalance += msg.value;
        } else {
            require(src.transferFrom(msg.sender, address(kyberNetworkContract), srcAmount));
        }

        uint platformFeeBps = getFeeBpsForWallet(platformWallet);
        
        (uint finalDestAmount, uint destAmountBeforePlatformFee) = kyberNetworkContract.tradeWithHintAndFee.value(msg.value)(
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
            userBalanceBefore.srcBalance,
            userBalanceBefore.destBalance,
            src,
            dest,
            destAddress
        );

        require(finalDestAmount == tradeOutcome.userDeltaDestAmount);
        require(tradeOutcome.userDeltaDestAmount <= maxDestAmount);
        require(tradeOutcome.actualRate >= minConversionRate);

        emit ExecuteTrade(msg.sender, src, dest, tradeOutcome.userDeltaSrcAmount, tradeOutcome.userDeltaDestAmount);
        return tradeOutcome.userDeltaDestAmount;
            
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

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev makes a trade between src and dest token and send dest token to destAddress
    /// @param src Src token
    /// @param srcAmount amount of src tokens
    /// @param dest Destination token
    /// @param destAddress Address to send tokens to
    /// @param maxDestAmount A limit on the amount of dest tokens
    /// @param minConversionRate The minimal conversion rate. If actual rate is lower, trade is canceled.
    /// @param platformWallet is the wallet ID to send part of the fees
    /// @return amount of actual dest tokens
    function tradeWithParsedHint(
        IERC20 src,
        uint srcAmount,
        IERC20 dest,
        address payable destAddress,
        uint maxDestAmount,
        uint minConversionRate,
        address payable platformWallet,
        IKyberNetwork.HintType e2tHintType,
        uint[] memory e2tReserveIds,
        uint[] memory e2tSplitsBps,
        IKyberNetwork.HintType t2eHintType,
        uint[] memory t2eReserveIds,
        uint[] memory t2eSplitsBps
    )
        internal
        returns(uint)
    {
        require(src == ETH_TOKEN_ADDRESS || msg.value == 0);

        UserBalance memory userBalanceBefore;

        userBalanceBefore.srcBalance = getBalance(src, msg.sender);
        userBalanceBefore.destBalance = getBalance(dest, destAddress);

        if (src == ETH_TOKEN_ADDRESS) {
            userBalanceBefore.srcBalance += msg.value;
        } else {
            require(src.transferFrom(msg.sender, address(kyberNetworkContract),srcAmount));
        }
        
        uint platformFeeBps = getFeeBpsForWallet(platformWallet);

        (uint finalDestAmount, uint destAmountBeforePlatformFee) = kyberNetworkContract.tradeWithParsedHintAndFee.value(msg.value)(
            msg.sender,
            src,
            srcAmount,
            dest,
            destAddress,
            maxDestAmount,
            minConversionRate,
            platformWallet,
            platformFeeBps,
            e2tHintType,
            e2tReserveIds,
            e2tSplitsBps,
            t2eHintType,
            t2eReserveIds,
            t2eSplitsBps
        );

        TradeOutcome memory tradeOutcome = calculateTradeOutcome(
            userBalanceBefore.srcBalance,
            userBalanceBefore.destBalance,
            src,
            dest,
            destAddress
        );

        require(finalDestAmount == tradeOutcome.userDeltaDestAmount);
        require(tradeOutcome.userDeltaDestAmount <= maxDestAmount);
        require(tradeOutcome.actualRate >= minConversionRate);

        emit ExecuteTrade(msg.sender, src, dest, tradeOutcome.userDeltaSrcAmount, tradeOutcome.userDeltaDestAmount);
        return tradeOutcome.userDeltaDestAmount;
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

        // return tradeWithHint(
        //     src,
        //     srcAmount,
        //     dest,
        //     msg.sender,
        //     MAX_QTY,
        //     minConversionRate,
        //     0,
        //     hint
        // );
    }

    /// @dev makes a trade from Ether to token. Sends token to msg sender
    /// @param token Destination token
    /// @param minConversionRate The minimal conversion rate. If actual rate is lower, trade is canceled.
    /// @return amount of actual dest tokens
    function swapEtherToToken(IERC20 token, uint minConversionRate) public payable returns(uint) {
        bytes memory hint;

        // return tradeWithHint(
        //     ETH_TOKEN_ADDRESS,
        //     msg.value,
        //     token,
        //     msg.sender,
        //     MAX_QTY,
        //     minConversionRate,
        //     0,
        //     hint
        // );
    }

    /// @dev makes a trade from token to Ether, sends Ether to msg sender
    /// @param token Src token
    /// @param srcAmount amount of src tokens
    /// @param minConversionRate The minimal conversion rate. If actual rate is lower, trade is canceled.
    /// @return amount of actual dest tokens
    function swapTokenToEther(IERC20 token, uint srcAmount, uint minConversionRate) public returns(uint) {
        bytes memory hint;

        // return tradeWithHint(
        //     token,
        //     srcAmount,
        //     ETH_TOKEN_ADDRESS,
        //     msg.sender,
        //     MAX_QTY,
        //     minConversionRate,
        //     0,
        //     hint
        // );
    }

    struct UserBalance {
        uint srcBalance;
        uint destBalance;
    }

    event ExecuteTrade(address indexed trader, IERC20 src, IERC20 dest, uint actualSrcAmount, uint actualDestAmount);


    event KyberNetworkSet(IKyberNetwork newNetworkContract, IKyberNetwork oldNetworkContract);

    function setKyberNetworkContract(IKyberNetwork _kyberNetworkContract) public onlyAdmin {

        require(_kyberNetworkContract != IKyberNetwork(0));

        emit KyberNetworkSet(_kyberNetworkContract, kyberNetworkContract);

        kyberNetworkContract = _kyberNetworkContract;
    }
    
    function getExpectedRate(ERC20 src, ERC20 dest, uint srcQty) external view
        returns (uint expectedRateAllFees, uint worsteRateAllFees) 
    {
            ( , , expectedRateAllFees, worsteRateAllFees) = kyberNetworkContract.getExpectedRateWithFee(src, dest, srcQty, 0);
    }

    function getExpectedRateBasic(IERC20 src, IERC20 dest, uint srcQty) 
        external view
        returns (uint expectedRateNoFees, uint expectedRateNetworkFees, uint expectedRateAllFees, uint worstRateAllFees)
    {
        return kyberNetworkContract.getExpectedRateWithFee(src, dest, srcQty, 0);
    }

    function maxGasPrice() public view returns(uint) {
        return kyberNetworkContract.maxGasPrice();
    }

    function enabled() public view returns(bool) {
        return kyberNetworkContract.enabled();
    }

    function info(bytes32 field) public view returns(uint) {
        return kyberNetworkContract.info(field);
    }

    struct TradeOutcome {
        uint userDeltaSrcAmount;
        uint userDeltaDestAmount;
        uint actualRate;
    }

    function calculateTradeOutcome (uint srcBalanceBefore, uint destBalanceBefore, IERC20 src, IERC20 dest,
        address destAddress)
        internal returns(TradeOutcome memory outcome)
    {
        uint userSrcBalanceAfter;
        uint userDestBalanceAfter;

        userSrcBalanceAfter = getBalance(src, msg.sender);
        userDestBalanceAfter = getBalance(dest, destAddress);

        //protect from underflow
        require(userDestBalanceAfter > destBalanceBefore);
        require(srcBalanceBefore > userSrcBalanceAfter);

        outcome.userDeltaDestAmount = userDestBalanceAfter - destBalanceBefore;
        outcome.userDeltaSrcAmount = srcBalanceBefore - userSrcBalanceAfter;

        outcome.actualRate = calcRateFromQty(
            outcome.userDeltaSrcAmount,
            outcome.userDeltaDestAmount,
            getDecimals(src),
            getDecimals(dest)
        );
    }
    
    function getFeeBpsForWallet(address payable platformWallet) internal view returns(uint platformFeeBps) {
        
        //todo: get fee from mapping.
        return(100);
    }
}
