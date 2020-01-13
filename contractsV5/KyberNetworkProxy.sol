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
    mapping(address=>uint) platformWalletFeeBps;    

    constructor(address _admin) public {
        require(_admin != address(0), "Proxy: admin address 0 not allowed");
        admin = _admin;
    }
    
    // backward compatible APIs
    function getExpectedRate(ERC20 src, ERC20 dest, uint srcQty) external view
        returns (uint expectedRate, uint worstRate)
    {
        bytes memory hint;    
        ( , expectedRate, ) = kyberNetworkContract.getExpectedRateWithHintAndFee(src, dest, srcQty, 0, hint);
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
    function getExpectedRateWithHint(IERC20 src, IERC20 dest, uint srcQty, bytes calldata hint) external view
        returns (uint expectedRate) 
    {
        ( ,expectedRate , ) = kyberNetworkContract.getExpectedRateWithHintAndFee(src, dest, srcQty, 0, hint);
    }

    function getExpectedRateAfterCustomFee(IERC20 src, IERC20 dest, uint srcQty, uint customFeeBps, bytes calldata hint) 
        external view
        returns (uint expectedRate)
    {
        ( , , expectedRate) = kyberNetworkContract.getExpectedRateWithHintAndFee(src, dest, srcQty, customFeeBps, hint);
    }
    
    function getPriceData(IERC20 src, IERC20 dest, uint srcQty) external view returns (uint priceNoFees)
    {
        bytes memory hint;    
        (priceNoFees, , ) = kyberNetworkContract.getExpectedRateWithHintAndFee(src, dest, srcQty, 0, hint);
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
        (uint feeBps, UserBalance memory userBalanceBefore) = 
            preapareTrade(src, dest, srcAmount, destAddress, platformWallet, platformFeeBps);

        (uint destAmount) = kyberNetworkContract.tradeWithHintAndFee.value(msg.value)(
            msg.sender,
            src,
            srcAmount,
            dest,
            destAddress,
            maxDestAmount,
            minConversionRate,
            platformWallet,
            feeBps,
            hint
        );

        TradeOutcome memory tradeOutcome = finalizeTradeValidateOutcome(src, dest, destAddress, maxDestAmount, minConversionRate,
            feeBps, userBalanceBefore, destAmount);

        return tradeOutcome.userDeltaDestToken;
            
    }
    
    event KyberNetworkSet(IKyberNetwork newNetworkContract, IKyberNetwork oldNetworkContract);

    function setKyberNetworkContract(IKyberNetwork _kyberNetworkContract) public onlyAdmin {

        require(_kyberNetworkContract != IKyberNetwork(0));

        emit KyberNetworkSet(_kyberNetworkContract, kyberNetworkContract);

        kyberNetworkContract = _kyberNetworkContract;
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
        uint destTokenAmountBeforeDeductingFee = (outcome.userDeltaDestToken * BPS) / (BPS - platformFeeBps);
        
        outcome.actualRate = calcRateFromQty(
            outcome.userDeltaSrcToken,
            destTokenAmountBeforeDeductingFee,
            getUpdateDecimals(src),
            getUpdateDecimals(dest)
        );
    }
    
    function preapareTrade(IERC20 src, IERC20 dest, uint srcAmount, address destAddress, address platformWallet, uint feeInputBps) 
        internal returns
        (uint platformFeeBps, UserBalance memory userBalanceBefore) 
    {
        require(src == ETH_TOKEN_ADDRESS || msg.value == 0);

        userBalanceBefore.srcBalance = getBalance(src, msg.sender);
        userBalanceBefore.destBalance = getBalance(dest, destAddress);

        if (src == ETH_TOKEN_ADDRESS) {
            userBalanceBefore.srcBalance += msg.value;
        } else {
            require(src.transferFrom(msg.sender, address(kyberNetworkContract), srcAmount));
        }
        
        if(feeInputBps == 0 && platformWallet != address(0)) {
            platformFeeBps = platformWalletFeeBps[platformWallet];
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
    
    // TODO: should we keep below funciton. TBD
    function setPlatformWalletFee(address platformWallet, uint feeBps) public {
        platformWalletFeeBps[platformWallet] = feeBps;
    }
}
