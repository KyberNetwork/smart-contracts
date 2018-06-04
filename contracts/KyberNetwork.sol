pragma solidity 0.4.18;


import "./ERC20Interface.sol";
import "./KyberReserveInterface.sol";
import "./KyberNetworkInterface.sol";
import "./Withdrawable.sol";
import "./Utils2.sol";
import "./PermissionGroups.sol";
import "./WhiteListInterface.sol";
import "./ExpectedRateInterface.sol";
import "./FeeBurnerInterface.sol";


////////////////////////////////////////////////////////////////////////////////////////////////////////
/// @title Kyber Network main contract
contract KyberNetwork is Withdrawable, Utils2, KyberNetworkInterface {

    uint public negligibleRateDiff = 10; // basic rate steps will be in 0.01%
    KyberReserveInterface[] public reserves;
    mapping(address=>bool) public isReserve;
    WhiteListInterface public whiteListContract;
    ExpectedRateInterface public expectedRateContract;
    FeeBurnerInterface    public feeBurnerContract;
    address               public kyberNetworkProxy;
    uint                  public maxGasPrice = 50 * 1000 * 1000 * 1000; // 50 gwei
    bool                  public enabled = false; // network is enabled
    mapping(bytes32=>uint) public info; // this is only a UI field for external app.
    mapping(address=>address[]) public reservesPerTokenSrc; //reserves supporting token to eth
    mapping(address=>address[]) public reservesPerTokenDest;//reserves support eth to token

    function KyberNetwork(address _admin) public {
        require(_admin != address(0));
        admin = _admin;
    }

    event EtherReceival(address indexed sender, uint amount);

    /* solhint-disable no-complex-fallback */
    function() public payable {
//        require(isReserve[msg.sender]);
        EtherReceival(msg.sender, msg.value);
    }
    /* solhint-enable no-complex-fallback */

    struct TradeInput {
        address trader;
        ERC20 src;
        uint srcAmount;
        ERC20 dest;
        address destAddress;
        uint maxDestAmount;
        uint minConversionRate;
        address walletId;
    }

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev trade api for kyber network.
    /// @param input structure of trade inputs
    function trade(TradeInput input) internal returns(uint) {
        require(enabled);
        require(tx.gasprice <= maxGasPrice);
        require(msg.sender == kyberNetworkProxy);
        require(validateTradeInput(input.src, input.srcAmount, input.destAddress));

        BestRateResult memory rateResult = findBestRateTokenToToken(input.src, input.dest, input.srcAmount);

        require(rateResult.rate > 0);
        require(rateResult.rate < MAX_RATE);
        require(rateResult.rate >= input.minConversionRate);

        uint actualDestAmount;
        uint ethAmount;
        uint actualSrcAmount;

        (actualSrcAmount, ethAmount, actualDestAmount) =
            calcActualAmounts(input.src, input.dest, input.srcAmount, input.maxDestAmount, rateResult);

        if (actualSrcAmount < input.srcAmount) {
            //if there is "change" send back to trader
            if (input.src == ETH_TOKEN_ADDRESS) {
                input.trader.transfer(input.srcAmount - actualSrcAmount);
            } else {
                input.src.transfer(input.trader, (input.srcAmount - actualSrcAmount));
            }
        }

        // verify trade size is smaller than user cap
        require(ethAmount <= getUserCapInWei(input.trader));

        //do the trade
        //src to ETH
        require(doReserveTrade(
                input.src,
                actualSrcAmount,
                ETH_TOKEN_ADDRESS,
                this,
                ethAmount,
                KyberReserveInterface(rateResult.reserve1),
                rateResult.rateSrcToEth,
                true));

        //Eth to dest
        require(doReserveTrade(
                ETH_TOKEN_ADDRESS,
                ethAmount,
                input.dest,
                input.destAddress,
                actualDestAmount,
                KyberReserveInterface(rateResult.reserve2),
                rateResult.rateEthToDest,
                true));

        //when src is ether, reserve1 is doing a "fake" trade. (ether to ether) - don't burn.
        //when dest is ether, reserve2 is doing a "fake" trade. (ether to ether) - don't burn.
        if (input.src != ETH_TOKEN_ADDRESS) require(feeBurnerContract.handleFees(ethAmount, rateResult.reserve1, input.walletId));
        if (input.dest != ETH_TOKEN_ADDRESS) require(feeBurnerContract.handleFees(ethAmount, rateResult.reserve2, input.walletId));

        return actualDestAmount;
    }

    function tradeWithHint(
        address trader,
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
        require(hint.length == 0);
        TradeInput memory tradeInput;

        tradeInput.trader = trader;
        tradeInput.src = src;
        tradeInput.srcAmount = srcAmount;
        tradeInput.dest = dest;
        tradeInput.destAddress = destAddress;
        tradeInput.maxDestAmount = maxDestAmount;
        tradeInput.minConversionRate = minConversionRate;
        tradeInput.walletId = walletId;

        return trade(tradeInput);
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

        address[] storage reserveArr = reservesPerTokenDest[token];
        uint i;

        if (ethToToken) {
            for (i = 0; i < reserveArr.length; i++) {
                if (reserve == reserveArr[i]) {
                    if(add) {
                        break; //already added
                    } else {
                        //remove
                        reserveArr[i] = reserveArr[reserveArr.length - 1];
                        reserveArr.length--;
                    }
                }
            }

            if (add && i == reserveArr.length) {
                //if reserve wasn't found add it
                reserveArr.push(reserve);
            }
        }

        if (tokenToEth) {
            reserveArr = reservesPerTokenSrc[token];
            for (i = 0; i < reserveArr.length; i++) {
                if (reserve == reserveArr[i]) {
                    if(add) {
                        break; //already added
                    } else {
                        //remove
                        reserveArr[i] = reserveArr[reserveArr.length - 1];
                        reserveArr.length--;
                    }
                }
            }

            if (add && i == reserveArr.length) {
                //reserve wasn't found
                reserveArr.push(reserve);
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

    function setWhiteList(WhiteListInterface whiteList) public onlyAdmin {
        require(whiteList != address(0));
        whiteListContract = whiteList;
    }

    function setExpectedRate(ExpectedRateInterface expectedRate) public onlyAdmin {
        require(expectedRate != address(0));
        expectedRateContract = expectedRate;
    }

    function setFeeBurner(FeeBurnerInterface feeBurner) public onlyAdmin {
        require(feeBurner != address(0));
        feeBurnerContract = feeBurner;
    }

    function setParams(
        uint                  _maxGasPrice,
        uint                  _negligibleRateDiff
    )
        public
        onlyAdmin
    {
        require(_negligibleRateDiff <= 100 * 100); // at most 100%

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

    event KyberProxySet(address proxy, address sender);
    function setKyberProxy(address networkProxy) public onlyAdmin {
        require(networkProxy != address(0));
        kyberNetworkProxy = networkProxy;
        KyberProxySet(kyberNetworkProxy, msg.sender);
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

    function getMaxGasPriceWei() public view returns(uint) {
        return maxGasPrice;
    }

    struct BestRateResult {
        uint rate;
        address reserve1;
        address reserve2;
        uint ethAmount;
        uint rateSrcToEth;
        uint rateEthToDest;
        uint actualDestAmount;
    }

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev best conversion rate for a pair of tokens, if number of reserves have small differences. randomize
    /// @param src Src token
    /// @param dest Destination token
    /// @return obsolete - used to return best reserve index. not relevant anymore for this API.
    function findBestRate(ERC20 src, ERC20 dest, uint srcAmount) public view returns(uint obsolete, uint rate) {
        BestRateResult memory result = findBestRateTokenToToken(src, dest, srcAmount);
        return(0, result.rate);
    }

    function findBestRateTokenToToken(ERC20 src, ERC20 dest, uint srcAmount) internal view
        returns(BestRateResult result)
    {
        (result.reserve1, result.rateSrcToEth) = searchBestRate(src, ETH_TOKEN_ADDRESS, srcAmount);
        result.ethAmount = calcDestAmount(src, ETH_TOKEN_ADDRESS, srcAmount, result.rateSrcToEth);

        (result.reserve2, result.rateEthToDest) = searchBestRate(ETH_TOKEN_ADDRESS, dest, result.ethAmount);
        result.actualDestAmount = calcDestAmount(ETH_TOKEN_ADDRESS, dest, result.ethAmount, result.rateEthToDest);

        result.rate = calcRateFromQty(srcAmount, result.actualDestAmount, getDecimals(src), getDecimals(dest));
    }

    /* solhint-disable code-complexity */
    //@dev this function always src or dest are ether. can't do token to token
    function searchBestRate(ERC20 src, ERC20 dest, uint srcAmount) internal view returns(address, uint) {
        uint bestRate = 0;
        uint bestReserve = 0;
        uint numRelevantReserves = 0;

        //return 1 for ether to ether
        if (src == dest) return (reserves[bestReserve], PRECISION);

        address[] storage reserveArr = reservesPerTokenSrc[src];

        if (src == ETH_TOKEN_ADDRESS) {
            reserveArr = reservesPerTokenDest[dest];
        }

        if (reserveArr.length == 0) return (reserves[bestReserve], bestRate);

        uint[] memory rates = new uint[](reserveArr.length);
        uint[] memory reserveCandidates = new uint[](reserveArr.length);

        for (uint i = 0; i < reserveArr.length; i++) {
            //list all reserves that have this token.
            rates[i] = (KyberReserveInterface(reserveArr[i])).getConversionRate(src, dest, srcAmount, block.number);

            if (rates[i] > bestRate) {
                //best rate is highest rate
                bestRate = rates[i];
            }
        }

        if (bestRate > 0) {
            uint random = 0;
            uint smallestRelevantRate = (bestRate * 10000) / (10000 + negligibleRateDiff);

            for (i = 0; i < reserveArr.length; i++) {
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

        return (reserveArr[bestReserve], bestRate);
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

    function getUserCapInTokenWei(address user, ERC20 token) public view returns(uint) {
        //future feature
        user;
        token;
        return 0;
    }

    function calcActualAmounts (ERC20 src, ERC20 dest, uint srcAmount, uint maxDestAmount, BestRateResult rateResult)
        internal view returns(uint actualSrcAmount, uint ethAmount, uint actualDestAmount)
    {
        if (rateResult.actualDestAmount > maxDestAmount) {
            actualDestAmount = maxDestAmount;
            ethAmount = calcSrcAmount(ETH_TOKEN_ADDRESS, dest, actualDestAmount, rateResult.rateEthToDest);
            actualSrcAmount = calcSrcAmount(src, ETH_TOKEN_ADDRESS, ethAmount, rateResult.rateSrcToEth);
            require(actualSrcAmount <= srcAmount);
        } else {
            actualDestAmount = rateResult.actualDestAmount;
            actualSrcAmount = srcAmount;
            ethAmount = rateResult.ethAmount;
        }
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
            //this is for a "fake" trade when both src and dest are ethers.
            if (destAddress != (address(this)))
                destAddress.transfer(amount);
            return true;
        }

        if (src == ETH_TOKEN_ADDRESS) {
            callValue = amount;
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

    function isEnabled() public view returns (bool) {
        return enabled;
    }

    function getInfo(bytes32 id) public view returns (uint) {
        return info[id];
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
            if ((msg.value != 0) || (src.balanceOf(this) < srcAmount))
                return false;
        }

        return true;
    }
}