pragma solidity ^0.4.18; // solhint-disable-line compiler-fixed


import "./ERC20Interface.sol";
import "./KyberReserve.sol";
import "./Withdrawable.sol";
import "./Utils.sol";
import "./PermissionGroups.sol";
import "./WhiteList.sol";
import "./ExpectedRate.sol";
import "./FeeBurner.sol";


////////////////////////////////////////////////////////////////////////////////////////////////////////
/// @title Kyber Network main contract
contract KyberNetwork is Withdrawable, Utils {
    /* solhint-disable no-simple-event-func-name */

    uint public negligibleRateDiff = 10; // basic rate steps will be in 0.01%
    KyberReserve[] public reserves;
    mapping(address=>bool) public isReserve;
    WhiteList public whiteList;
    ExpectedRateInterface public expectedRateContract;
    FeeBurnerInterface    public feeBurnerContract;
    uint                  public maxGasPrice = 50 * 1000 * 1000 * 1000; // 50 gwei
    bool                  public enable = true; // network is enabled
    mapping(address=>mapping(bytes32=>bool)) internal perReserveListedPairs;

    function KyberNetwork(address _admin) public {
        admin = _admin;
    }

    event EtherReceival(address indexed sender, uint amount);

    /* solhint-disable no-complex-fallback */
    function() public payable {
        require(isReserve[msg.sender]);
        EtherReceival(msg.sender, msg.value);
    }
    /* solhint-enable no-complex-fallback */

    event Trade(address indexed sender, ERC20 source, ERC20 dest, uint actualSrcAmount, uint actualDestAmount);

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev makes a trade between source and dest token and send dest token to destAddress
    /// @param source Source token
    /// @param srcAmount amount of source tokens
    /// @param dest   Destination token
    /// @param destAddress Address to send tokens to
    /// @param maxDestAmount A limit on the amount of dest tokens
    /// @param minConversionRate The minimal conversion rate. If actual rate is lower, trade is canceled.
    /// @return amount of actual dest tokens
    function trade(
        ERC20 source,
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
        require(enable);

        uint userSrcBalanceBefore;
        uint userSrcBalanceAfter;
        uint userDestBalanceBefore;
        uint userDestBalanceAfter;

        userSrcBalanceBefore = getBalance(source, msg.sender);
        if (source == ETH_TOKEN_ADDRESS)
            userSrcBalanceBefore += msg.value;
        userDestBalanceBefore = getBalance(dest, destAddress);

        uint actualDestAmount = doTrade(source,
                                        srcAmount,
                                        dest,
                                        destAddress,
                                        maxDestAmount,
                                        minConversionRate,
                                        walletId
                                        );
        require(actualDestAmount > 0);

        userSrcBalanceAfter = getBalance(source, msg.sender);
        userDestBalanceAfter = getBalance(dest, destAddress);

        require(userSrcBalanceAfter <= userSrcBalanceBefore);
        require(userDestBalanceAfter >= userDestBalanceBefore);
        
        require((userDestBalanceAfter - userDestBalanceBefore) >=
                 calcDstQty((userSrcBalanceBefore - userSrcBalanceAfter), getDecimals(source), getDecimals(dest), minConversionRate));

        return actualDestAmount;
    }

    event AddReserve(KyberReserve reserve, bool add);

    /// @notice can be called only by admin
    /// @dev add or deletes a reserve to/from the network.
    /// @param reserve The reserve address.
    /// @param add If true, the add reserve. Otherwise delete reserve.
    function addReserve(KyberReserve reserve, bool add) public onlyAdmin {

        if (add) {
            reserves.push(reserve);
            isReserve[reserve] = true;
            AddReserve(reserve, true);
        } else {
            isReserve[reserve] = false;
            // will have trouble if more than 50k reserves...
            for (uint i = 0; i < reserves.length; i++) {
                if (reserves[i] == reserve) {
                    if (reserves.length == 0) return;
                    reserves[i] = reserves[--reserves.length];
                    AddReserve(reserve, false);
                    break;
                }
            }
        }
    }

    event ListPairsForReserve(address reserve, ERC20 source, ERC20 dest, bool add);

    /// @notice can be called only by admin
    /// @dev allow or prevent a specific reserve to trade a pair of tokens
    /// @param reserve The reserve address.
    /// @param source Source token
    /// @param dest Destination token
    /// @param add If true then enable trade, otherwise delist pair.
    function listPairForReserve(address reserve, ERC20 source, ERC20 dest, bool add) public onlyAdmin {
        (perReserveListedPairs[reserve])[keccak256(source, dest)] = add;

        if (source != ETH_TOKEN_ADDRESS) {
            if (add) {
                source.approve(reserve, 2**255); // approve infinity
            } else {
                source.approve(reserve, 0);
            }
        }

        ListPairsForReserve(reserve, source, dest, add);
    }

    function setParams(
        WhiteList _whiteList,
        ExpectedRateInterface _expectedRate,
        FeeBurnerInterface    _feeBurner,
        uint                  _maxGasPrice,
        uint                  _negligibleDiff
    )
        public
        onlyAdmin
    {
        whiteList = _whiteList;
        expectedRateContract = _expectedRate;
        feeBurnerContract = _feeBurner;
        maxGasPrice = _maxGasPrice;
        negligibleRateDiff = _negligibleDiff;
    }

    function setEnable(bool _enable) public onlyAdmin {
        enable = _enable;
    }

    /// @dev returns number of reserves
    /// @return number of reserves
    function getNumReserves() public view returns(uint) {
        return reserves.length;
    }

    /// @notice should be called off chain with as much gas as needed
    /// @dev get an array of all reserves
    /// @return An array of all reserves
    function getReserves() public view returns(KyberReserve[]) {
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
    /// @param source Source token
    /// @param dest Destination token
    /* solhint-disable code-complexity */
    function findBestRate(ERC20 source, ERC20 dest, uint srcQty) public view returns(uint, uint) {
        uint bestRate = 0;
        uint bestReserve = 0;
        uint numRelevantReserves = 0;
        uint numReserves = reserves.length;
        uint[] memory rates = new uint[](numReserves);
        uint[] memory reserveCandidates = new uint[](numReserves);

        for (uint i = 0; i < numReserves; i++) {
            //list all reserves that have this token.
            if (!(perReserveListedPairs[reserves[i]])[keccak256(source, dest)]) continue;

            rates[i] = reserves[i].getConversionRate(source, dest, srcQty, block.number);

            if (rates[i] > bestRate) {
                //best rate is highest rate
                bestRate = rates[i];
            }
        }

        if (bestRate > 0) {
            uint random = 0;
            uint smallestRelevantRate = (bestRate * 10000) / (10000 + negligibleRateDiff);

            for (i = 0; i < numReserves; i++) {
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

        return (bestReserve, bestRate);
    }
    /* solhint-enable code-complexity */

    function getExpectedRate(ERC20 source, ERC20 dest, uint srcQuantity)
        public view
        returns (uint expectedRate, uint slippageRate)
    {
        require(expectedRateContract != address(0));
        return expectedRateContract.getExpectedRate(source, dest, srcQuantity);
    }

    function getUserCapInWei(address user) public view returns(uint) {
        return whiteList.getUserCapInWei(user);
    }

    function doTrade(
        ERC20 source,
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
        require(whiteList != address(0));
        require(feeBurnerContract != address(0));
        require(validateTradeInput(source, srcAmount));

        uint reserveInd;
        uint rate;

        (reserveInd, rate) = findBestRate(source, dest, srcAmount);
        KyberReserve theReserve = reserves[reserveInd];
        require(rate > 0);
        require(rate < MAX_RATE);
        require(rate >= minConversionRate);

        uint actualSourceAmount = srcAmount;
        uint actualDestAmount = calcDestAmount(source, dest, actualSourceAmount, rate);
        if (actualDestAmount > maxDestAmount) {
            actualDestAmount = maxDestAmount;
            actualSourceAmount = calcSrcAmount(source, dest, actualDestAmount, rate);
        }

        // do the trade
        // verify trade size is smaller then user cap
        uint ethAmount;
        if (source == ETH_TOKEN_ADDRESS) {
            ethAmount = actualSourceAmount;
        } else {
            ethAmount = actualDestAmount;
        }

        require(ethAmount <= getUserCapInWei(msg.sender));
        require(doReserveTrade(
                source,
                actualSourceAmount,
                dest,
                destAddress,
                actualDestAmount,
                theReserve,
                rate,
                true));

        if ((actualSourceAmount < srcAmount) && (source == ETH_TOKEN_ADDRESS)) {
            msg.sender.transfer(srcAmount-actualSourceAmount);
        }

        require(feeBurnerContract.handleFees(ethAmount, theReserve, walletId));

        Trade(msg.sender, source, dest, actualSourceAmount, actualDestAmount);
        return actualDestAmount;
    }

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev do one trade with a reserve
    /// @param source Source token
    /// @param amount amount of source tokens
    /// @param dest   Destination token
    /// @param destAddress Address to send tokens to
    /// @param reserve Reserve to use
    /// @param validate If true, additional validations are applicable
    /// @return true if trade is successful
    function doReserveTrade(
        ERC20 source,
        uint amount,
        ERC20 dest,
        address destAddress,
        uint expectedDestAmount,
        KyberReserve reserve,
        uint conversionRate,
        bool validate
    )
        internal
        returns(bool)
    {
        uint callValue = 0;

        if (source == ETH_TOKEN_ADDRESS) {
            callValue = amount;
        } else {
            // take source tokens to this contract
            source.transferFrom(msg.sender, this, amount);
        }

        // reserve send tokens/eth to network. network sends it to destination
        require(reserve.trade.value(callValue)(source, amount, dest, this, conversionRate, validate));

        if (dest == ETH_TOKEN_ADDRESS) {
            destAddress.transfer(expectedDestAmount);
        } else {
            require(dest.transfer(destAddress, expectedDestAmount));
        }

        return true;
    }

    function getDecimals(ERC20 token) internal view returns(uint) {
        if (token == ETH_TOKEN_ADDRESS) return 18;
        return token.decimals();
    }

    function calcDestAmount(ERC20 source, ERC20 dest, uint srcAmount, uint rate) internal view returns(uint) {
        return calcDstQty(srcAmount, getDecimals(source), getDecimals(dest), rate);
    }

    function calcSrcAmount(ERC20 source, ERC20 dest, uint destAmount, uint rate) internal view returns(uint) {
        return calcSrcQty(destAmount, getDecimals(source), getDecimals(dest), rate);
    }

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev checks that user sent ether/tokens to contract before trade
    /// @param source Source token
    /// @param srcAmount amount of source tokens
    /// @return true if input is valid
    function validateTradeInput(ERC20 source, uint srcAmount) internal view returns(bool) {
        require(srcAmount < MAX_QTY);

        if (source == ETH_TOKEN_ADDRESS) {
            require(msg.value == srcAmount);
        } else {
            require(msg.value == 0);
            require(source.allowance(msg.sender, this) >= srcAmount);
        }

        return true;
    }
}
