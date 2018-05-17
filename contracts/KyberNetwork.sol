pragma solidity 0.4.18;


import "./ERC20Interface.sol";
import "./KyberReserveInterface.sol";
import "./Withdrawable.sol";
import "./Utils.sol";
import "./PermissionGroups.sol";
import "./WhiteListInterface.sol";
import "./ExpectedRateInterface.sol";
import "./FeeBurnerInterface.sol";


////////////////////////////////////////////////////////////////////////////////////////////////////////
/// @title Kyber Network main contract
contract KyberNetwork is Withdrawable, Utils {

    uint public negligibleRateDiff = 10; // basic rate steps will be in 0.01%
    KyberReserveInterface[] public reserves;
    mapping(address=>bool) public isReserve;
    WhiteListInterface public whiteListContract;
    ExpectedRateInterface public expectedRateContract;
    FeeBurnerInterface    public feeBurnerContract;
    uint                  public maxGasPrice = 50 * 1000 * 1000 * 1000; // 50 gwei
    bool                  public enabled = false; // network is enabled
    mapping(bytes32=>uint) public info; // this is only a UI field for external app.
    mapping(address=>address[]) resrevesPerTokenSrc; //reserves supporting token to eth
    mapping(address=>address[]) resrevesPerTokenDest;//reserves support eth to token

    function KyberNetwork(address _admin) public {
        require(_admin != address(0));
        admin = _admin;
    }

    event EtherReceival(address indexed sender, uint amount);

    /* solhint-disable no-complex-fallback */
    function() public payable {
        require(isReserve[msg.sender]);
        EtherReceival(msg.sender, msg.value);
    }
    /* solhint-enable no-complex-fallback */

    event ExecuteNetworkTrade(address indexed sender, ERC20 src, ERC20 dest, uint actualSrcAmount, uint actualDestAmount);
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
        require(enabled);

        uint userSrcBalanceBefore;
        uint userSrcBalanceAfter;
        uint userDestBalanceBefore;
        uint userDestBalanceAfter;

        userSrcBalanceBefore = getBalance(src, msg.sender);
        if (src == ETH_TOKEN_ADDRESS)
            userSrcBalanceBefore += msg.value;
        userDestBalanceBefore = getBalance(dest, destAddress);

        uint actualDestAmount = doTrade(src,
                                        srcAmount,
                                        dest,
                                        destAddress,
                                        maxDestAmount,
                                        minConversionRate,
                                        walletId
                                        );
        require(actualDestAmount > 0);

        userSrcBalanceAfter = getBalance(src, msg.sender);
        userDestBalanceAfter = getBalance(dest, destAddress);

        require(userSrcBalanceAfter < userSrcBalanceBefore);
        require(userDestBalanceAfter > userDestBalanceBefore);

        require((userDestBalanceAfter - userDestBalanceBefore) >=
            calcDstQty((userSrcBalanceBefore - userSrcBalanceAfter), getDecimals(src), getDecimals(dest),
                minConversionRate));

        return actualDestAmount;
    }

    event AddReserveToNetwork(KyberReserveInterface reserve, bool add);
    /// @notice can be called only by admin
    /// @dev add or deletes a reserve to/from the network.
    /// @param reserve The reserve address.
    /// @param add If true, the add reserve. Otherwise delete reserve.
    function addReserve(KyberReserveInterface reserve, bool add) public onlyAdmin {

        if (add) {
            require(!isReserve[reserve]);
            reserves.push(reserve);
            isReserve[reserve] = true;
            AddReserveToNetwork(reserve, true);
        } else {
            isReserve[reserve] = false;
            // will have trouble if more than 50k reserves...
            for (uint i = 0; i < reserves.length; i++) {
                if (reserves[i] == reserve) {
                    reserves[i] = reserves[reserves.length - 1];
                    reserves.length--;
                    AddReserveToNetwork(reserve, false);
                    break;
                }
            }
        }
    }

    event ListReservePairs(address reserve, ERC20 src, ERC20 dest, bool add);
    /// @notice can be called only by admin
    /// @dev allow or prevent a specific reserve to trade a pair of tokens
    /// @param reserve The reserve address.
    /// @param token token address
    /// @param ethToToken will it support ether to token trade
    /// @param tokenToEth will it support token to ether trade
    /// @param add If true then list this pair, otherwise unlist it.
    function listPairForReserve(address reserve, ERC20 token, bool ethToToken, bool tokenToEth, bool add) public onlyAdmin {
        require(isReserve[reserve]);
        address [] storage reservs = resrevesPerTokenDest[token];
        uint i;

        if (ethToToken) {
            for (i = 0; i < reservs.length; i++) {
                if (reserve == reservs[i]) {
                    if(add) {
                        break; //already added
                    } else {
                        //remove
                        reservs[i] = reservs[reservs.length - 1];
                        reservs.length--;
                    }
                }
            }

            if (add && i == reservs.length) {
                //if reserve wasn't found add it
                reservs.push(reserve);
            }
        }

        if (tokenToEth) {
            reservs = resrevesPerTokenSrc[token];
            for (i = 0; i < reservs.length; i++) {
                if (reserve == reservs[i]) {
                    if(add) {
                        break; //already added
                    } else {
                        //remove
                        reservs[i] = reservs[reservs.length - 1];
                        reservs.length--;
                    }
                }
            }

            if (add && i == reservs.length) {
                //reserve wasn't found
                reservs.push(reserve);
                token.approve(reserve, 2**255); // approve infinity
            }
            if (!add) {
                token.approve(reserve, 0);
            }
        }

        setDecimals(token);

        if (ethToToken) ListReservePairs(reserve, ETH_TOKEN_ADDRESS, token, add);
        if (tokenToEth) ListReservePairs(reserve, token, ETH_TOKEN_ADDRESS, add);
    }

    function setParams(
        WhiteListInterface    _whiteList,
        ExpectedRateInterface _expectedRate,
        FeeBurnerInterface    _feeBurner,
        uint                  _maxGasPrice,
        uint                  _negligibleRateDiff
    )
        public
        onlyAdmin
    {
        require(_whiteList != address(0));
        require(_feeBurner != address(0));
        require(_expectedRate != address(0));
        require(_negligibleRateDiff <= 100 * 100); // at most 100%

        whiteListContract = _whiteList;
        expectedRateContract = _expectedRate;
        feeBurnerContract = _feeBurner;
        maxGasPrice = _maxGasPrice;
        negligibleRateDiff = _negligibleRateDiff;
    }

    function setEnable(bool _enable) public onlyAdmin {
        if (_enable) {
            require(whiteListContract != address(0));
            require(feeBurnerContract != address(0));
            require(expectedRateContract != address(0));
        }
        enabled = _enable;
    }

    function setInfo(bytes32 field, uint value) public onlyOperator {
        info[field] = value;
    }

    /// @dev returns number of reserves
    /// @return number of reserves
    function getNumReserves() public view returns(uint) {
        return reserves.length;
    }

    /// @notice should be called off chain with as much gas as needed
    /// @dev get an array of all reserves
    /// @return An array of all reserves
    function getReserves() public view returns(KyberReserveInterface[]) {
        return reserves;
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

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev best conversion rate for a pair of tokens, if number of reserves have small differences. randomize
    /// @param src Src token
    /// @param dest Destination token
    function findBestRate(ERC20 src, ERC20 dest, uint srcQty) public view returns(address noUse, uint rate) {
        address noUse2;
        uint noUse3;
        uint noUse4;
        uint ethAmount;

        (rate, noUse, noUse2, ethAmount, noUse3, noUse4) = findBestRateTokenToToken(src, dest, srcQty);
    }

    function findBestRateTokenToToken(ERC20 src, ERC20 dest, uint srcQty) internal view
        returns(uint rate, address reserve1, address reserve2, uint ethAmount, uint rateSrcToEth, uint rateEthToDest)
    {
        (reserve1, rateSrcToEth) = searchBestRate(src, ETH_TOKEN_ADDRESS, srcQty);
        ethAmount = calcDestAmount(src, ETH_TOKEN_ADDRESS, srcQty, rateSrcToEth);

        (reserve2, rateEthToDest) = searchBestRate(ETH_TOKEN_ADDRESS, dest, ethAmount);
        rate = rateSrcToEth * rateEthToDest / PRECISION;
    }

    /* solhint-disable code-complexity */
    //@dev this function always src or dest are ether. can't do token to token
    function searchBestRate(ERC20 src, ERC20 dest, uint srcQty) internal view returns(address, uint) {
        uint bestRate = 0;
        uint bestReserve = 0;
        uint numRelevantReserves = 0;

        //return 1 for ether to ether
        if (src == dest) return (reserves[bestReserve], PRECISION);

        address [] storage reservs = resrevesPerTokenSrc[src];
        if (src == ETH_TOKEN_ADDRESS) {
            reservs = resrevesPerTokenDest[dest];
        }

        uint[] memory rates = new uint[](reservs.length);
        uint[] memory reserveCandidates = new uint[](reservs.length);

        for (uint i = 0; i < reservs.length; i++) {
            //list all reserves that have this token.
            rates[i] = (KyberReserveInterface(reservs[i])).getConversionRate(src, dest, srcQty, block.number);

            if (rates[i] > bestRate) {
                //best rate is highest rate
                bestRate = rates[i];
            }
        }

        if (bestRate > 0) {
            uint random = 0;
            uint smallestRelevantRate = (bestRate * 10000) / (10000 + negligibleRateDiff);

            for (i = 0; i < reservs.length; i++) {
                if (rates[i] >= smallestRelevantRate) {
                    reserveCandidates[numRelevantReserves++] = i;
                }
            }

            if (numRelevantReserves > 1) {
                //when encountering small rate diff from bestRate. draw from relevant reserves
                random = uint(block.blockhash(block.number-1)) % numRelevantReserves;
            }

            bestReserve = reserveCandidates[random];
            bestRate = rates[bestReserve];
        }

        return (reservs[bestReserve], bestRate);
    }
    /* solhint-enable code-complexity */

    function getExpectedRate(ERC20 src, ERC20 dest, uint srcQty)
        public view
        returns (uint expectedRate, uint slippageRate)
    {
        require(expectedRateContract != address(0));
        return expectedRateContract.getExpectedRate(src, dest, srcQty);
    }

    function getUserCapInWei(address user) public view returns(uint) {
        return whiteListContract.getUserCapInWei(user);
    }

    struct Amount {
        uint eth;
        uint actualDest;
        uint actualSrc;
    }

    function doTrade(
        ERC20 src,
        uint srcAmount,
        ERC20 dest,
        address destAddress,
        uint maxDestAmount,
        uint minConversionRate,
        address walletId
    )
        internal
        returns(uint)
    {
        require(tx.gasprice <= maxGasPrice);
        require(validateTradeInput(src, srcAmount, destAddress));

        Amount memory amount;
        address reserve1;
        address reserve2;
        uint rate;
        uint rateSrcToEth;
        uint rateEthToDest;

        (rate, reserve1, reserve2, amount.eth, rateSrcToEth, rateEthToDest) =
            findBestRateTokenToToken(src, dest, srcAmount);

        require(rate > 0);
        require(rate < MAX_RATE);
        require(rate >= minConversionRate);

        amount.actualSrc = srcAmount;
        amount.actualDest = calcDestAmount(src, dest, amount.actualSrc, rate);
        if (amount.actualDest > maxDestAmount) {
            amount.actualDest = maxDestAmount;
            amount.eth = calcSrcAmount(ETH_TOKEN_ADDRESS, dest, amount.actualDest, rateEthToDest);
            amount.actualSrc = calcSrcAmount(src, ETH_TOKEN_ADDRESS, amount.eth, rateSrcToEth);
            require(amount.actualSrc <= srcAmount);
            if ((amount.actualSrc < srcAmount) && (src == ETH_TOKEN_ADDRESS)) {
                msg.sender.transfer(srcAmount - amount.actualSrc);
            }
        }

        // do the trade
        // verify trade size is smaller than user cap
        require(amount.eth <= getUserCapInWei(msg.sender));

        //src to ETH
        require(doReserveTrade(
                src,
                amount.actualSrc,
                ETH_TOKEN_ADDRESS,
                this,
                amount.eth,
                KyberReserveInterface(reserve1),
                rateSrcToEth,
                true));

        //Eth to dest
        require(doReserveTrade(
                ETH_TOKEN_ADDRESS,
                amount.eth,
                dest,
                destAddress,
                amount.actualDest,
                KyberReserveInterface(reserve2),
                rateEthToDest,
                true));

        //when src is ether, reserve1 is doing a "fake" trade. (ether to ether) - don't burn.
        //when dest is ether, reserve2 is doing a "fake" trade. (ether to ether) - don't burn.
        if (src != ETH_TOKEN_ADDRESS) require(feeBurnerContract.handleFees(amount.eth, reserve1, walletId));
        if (dest != ETH_TOKEN_ADDRESS) require(feeBurnerContract.handleFees(amount.eth, reserve2, walletId));

        ExecuteNetworkTrade(msg.sender, src, dest, amount.actualSrc, amount.actualDest);
        return amount.actualDest;
    }

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev do one trade with a reserve
    /// @param src Src token
    /// @param amount amount of src tokens
    /// @param dest   Destination token
    /// @param destAddress Address to send tokens to
    /// @param reserve Reserve to use
    /// @param validate If true, additional validations are applicable
    /// @return true if trade is successful
    function doReserveTrade(
        ERC20 src,
        uint amount,
        ERC20 dest,
        address destAddress,
        uint expectedDestAmount,
        KyberReserveInterface reserve,
        uint conversionRate,
        bool validate
    )
        internal
        returns(bool)
    {
        uint callValue = 0;

        if (src == dest) {
            //this is for a "fake" trade when both src and dest are ehters.
            if (destAddress != (address(this)))
                destAddress.transfer(amount);
            return true;
        }

        if (src == ETH_TOKEN_ADDRESS) {
            callValue = amount;
        } else {
            // take src tokens to this contract
            src.transferFrom(msg.sender, this, amount);
        }

        // reserve sends tokens/eth to network. network sends it to destination
        require(reserve.trade.value(callValue)(src, amount, dest, this, conversionRate, validate));

        if (destAddress != address(this)) {
            //for token to token dest address is network. and Ether / token already here...
            if (dest == ETH_TOKEN_ADDRESS) {
                destAddress.transfer(expectedDestAmount);
            } else {
                require(dest.transfer(destAddress, expectedDestAmount));
            }
        }

        return true;
    }

    function calcDestAmount(ERC20 src, ERC20 dest, uint srcAmount, uint rate) internal view returns(uint) {
        if (src == dest) return srcAmount;
        return calcDstQty(srcAmount, getDecimals(src), getDecimals(dest), rate);
    }

    function calcSrcAmount(ERC20 src, ERC20 dest, uint destAmount, uint rate) internal view returns(uint) {
        return calcSrcQty(destAmount, getDecimals(src), getDecimals(dest), rate);
    }

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev checks that user sent ether/tokens to contract before trade
    /// @param src Src token
    /// @param srcAmount amount of src tokens
    /// @return true if input is valid
    function validateTradeInput(ERC20 src, uint srcAmount, address destAddress) internal view returns(bool) {
        if ((srcAmount >= MAX_QTY) || (srcAmount == 0) || (destAddress == 0))
            return false;

        if (src == ETH_TOKEN_ADDRESS) {
            if (msg.value != srcAmount)
                return false;
        } else {
            if ((msg.value != 0) || (src.allowance(msg.sender, this) < srcAmount))
                return false;
        }

        return true;
    }
}
