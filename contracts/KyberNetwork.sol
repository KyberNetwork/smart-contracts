pragma solidity ^0.4.8;

import "./ERC20Interface.sol";
import "./KyberReserve.sol";

////////////////////////////////////////////////////////////////////////////////////////////////////////

/// @title Kyber Network main contract
/// @author Yaron Velner

contract KyberNetwork {
    address admin;
    ERC20 constant public ETH_TOKEN_ADDRESS = ERC20(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);
    uint  constant PRECISION = (10**18);
    uint  constant EPSILON = (1000);
    KyberReserve[] public reserves;

    mapping(address=>mapping(bytes32=>bool)) perReserveListedPairs;

    event ErrorReport( address indexed origin, uint error, uint errorInfo );

    /// @dev c'tor.
    /// @param _admin The address of the administrator
    function KyberNetwork( address _admin ) {
        admin = _admin;
    }


    struct KyberReservePairInfo {
        uint rate;
        uint reserveBalance;
        KyberReserve reserve;
    }


    /// @dev returns number of reserves
    /// @return number of reserves
    function getNumReserves() constant returns(uint){
        return reserves.length;
    }

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev information on conversion rate from source to dest in specific reserve manager
    /// @param source Source token
    /// @param dest   Destinatoin token
    /// @return (conversion rate,experation block,dest token balance of reserve)
    function getRate( ERC20 source, ERC20 dest, uint reserveIndex ) constant returns(uint rate, uint expBlock, uint balance){
        (rate,expBlock, balance) = reserves[reserveIndex].getPairInfo(source,dest);
    }

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev information on conversion rate to a front end application
    /// @param source Source token
    /// @param dest   Destinatoin token
    /// @return rate. If not available returns 0.

    function getPrice( ERC20 source, ERC20 dest ) constant returns(uint) {
      uint rate; uint expBlock; uint balance;
      (rate, expBlock, balance) = getRate( source, dest, 0 );
      if( expBlock >= block.number ) return 0; // TODO - consider add 1
      if( balance == 0 ) return 0; // TODO - decide on minimal qty
      return rate;
    }

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev best conversion rate for a pair of tokens
    /// @param source Source token
    /// @param dest   Destinatoin token
    /// @return KyberReservePairInfo structure
    function findBestRate( ERC20 source, ERC20 dest ) internal constant returns(KyberReservePairInfo) {
        uint bestRate;
        uint bestReserveBalance = 0;
        uint numReserves = reserves.length;

        KyberReservePairInfo memory output;
        KyberReserve bestReserve = KyberReserve(0);

        for( uint i = 0 ; i < numReserves ; i++ ) {
            var (rate,expBlock,balance) = reserves[i].getPairInfo(source,dest);

            if( (expBlock >= block.number) && (balance > 0) && (rate > bestRate ) ) {
                bestRate = rate;
                bestReserveBalance = balance;
                bestReserve = reserves[i];
            }
        }
        output.rate = bestRate;
        output.reserveBalance = bestReserveBalance;
        output.reserve = bestReserve;

        return output;
    }


    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev do one trade with a reserve
    /// @param source Source token
    /// @param amount amount of source tokens
    /// @param dest   Destinatoin token
    /// @param destAddress Address to send tokens to
    /// @param reserve Reserve to use
    /// @param validate If true, additional validations are applicable
    /// @return true if trade is succesful
    function doSingleTrade( ERC20 source, uint amount,
                            ERC20 dest, address destAddress,
                            KyberReserve reserve,
                            bool validate ) internal returns(bool) {

        uint callValue = 0;
        if( source == ETH_TOKEN_ADDRESS ) callValue = amount;
        else {
            // take source tokens to this contract
            source.transferFrom(msg.sender, this, amount);

            // let reserve use network tokens
            source.approve( reserve, amount);
        }

        if( ! reserve.trade.value(callValue)(source, amount, dest, destAddress, validate ) ) {
            if( source != ETH_TOKEN_ADDRESS ) {
                // reset tokens for reserve
                if( ! source.approve( reserve, 0) ) throw;

                // send tokens back to sender
                if( ! source.transfer(msg.sender, amount) ) throw;
            }

            return false;
        }

        if( source != ETH_TOKEN_ADDRESS ) {
            source.approve( reserve, 0);
        }

        return true;
    }

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev checks that user sent ether/tokens to contract before trade
    /// @param source Source token
    /// @param srcAmount amount of source tokens
    /// @return true if input is valid
    function validateTradeInput( ERC20 source, uint srcAmount ) constant internal returns(bool) {
        if( source != ETH_TOKEN_ADDRESS && msg.value > 0 ) {
            // shouldn't send ether for token exchange
            ErrorReport( tx.origin, 0x85000000, 0 );
            return false;
        }
        else if( source == ETH_TOKEN_ADDRESS && msg.value != srcAmount ) {
            // amount of sent ether is wrong
            ErrorReport( tx.origin, 0x85000001, msg.value );
            return false;
        }
        else if( source != ETH_TOKEN_ADDRESS ) {
            if( source.allowance(msg.sender,this) < srcAmount ) {
                // insufficient allowane
                ErrorReport( tx.origin, 0x85000002, msg.value );
                return false;
            }
        }

        return true;

    }

    event Trade( address indexed sender, ERC20 source, ERC20 dest, uint actualSrcAmount, uint actualDestAmount );

    struct ReserveTokenInfo {
        uint rate;
        KyberReserve reserve;
        uint reserveBalance;
    }

    struct TradeInfo {
        uint convertedDestAmount;
        uint remainedSourceAmount;

        bool tradeFailed;
    }

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev makes a trade between source and dest token and send dest token to
    /// destAddress and record wallet id for later payment
    /// @param source Source token
    /// @param srcAmount amount of source tokens
    /// @param dest   Destinatoin token
    /// @param destAddress Address to send tokens to
    /// @param maxDestAmount A limit on the amount of dest tokens
    /// @param minConversionRate The minimal conversion rate. If actual rate is lower, trade is canceled.
    /// @param throwOnFailure if true and trade is not completed, then function throws.
    /// @return amount of actual dest tokens
    function walletTrade( ERC20 source, uint srcAmount,
                    ERC20 dest, address destAddress, uint maxDestAmount,
                    uint minConversionRate,
                    bool throwOnFailure,
                    bytes32 walletId ) payable returns(uint) {
       // TODO - log wallet id
       return trade( source, srcAmount, dest, destAddress, maxDestAmount,
                     minConversionRate, throwOnFailure );
    }


    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev makes a trade between source and dest token and send dest token to destAddress
    /// @param source Source token
    /// @param srcAmount amount of source tokens
    /// @param dest   Destinatoin token
    /// @param destAddress Address to send tokens to
    /// @param maxDestAmount A limit on the amount of dest tokens
    /// @param minConversionRate The minimal conversion rate. If actual rate is lower, trade is canceled.
    /// @param throwOnFailure if true and trade is not completed, then function throws.
    /// @return amount of actual dest tokens
    function trade( ERC20 source, uint srcAmount,
                    ERC20 dest, address destAddress, uint maxDestAmount,
                    uint minConversionRate,
                    bool throwOnFailure ) payable returns(uint) {

        if( ! validateTradeInput( source, srcAmount ) ) {
            // invalid input
            ErrorReport( tx.origin, 0x86000000, 0 );
            if( msg.value > 0 ) {
                if( ! msg.sender.send(msg.value) ) throw;
            }
            if( throwOnFailure ) throw;
            return 0;
        }

        TradeInfo memory tradeInfo = TradeInfo(0,srcAmount,false);

        while( (tradeInfo.convertedDestAmount + EPSILON < maxDestAmount) && (tradeInfo.remainedSourceAmount > EPSILON) ) {
            KyberReservePairInfo memory reserveInfo = findBestRate(source,dest);

            if( reserveInfo.rate == 0 || reserveInfo.rate < minConversionRate ) {
                tradeInfo.tradeFailed = true;
                // no more available funds
                ErrorReport( tx.origin, 0x86000001, tradeInfo.remainedSourceAmount );
                break;
            }

            uint actualSrcAmount = tradeInfo.remainedSourceAmount;
            // TODO - overflow check
            uint actualDestAmount = (actualSrcAmount * reserveInfo.rate) / PRECISION;
            if( actualDestAmount > reserveInfo.reserveBalance ) {
                actualDestAmount = reserveInfo.reserveBalance;
            }
            if( actualDestAmount + tradeInfo.convertedDestAmount > maxDestAmount ) {
                actualDestAmount = maxDestAmount - tradeInfo.convertedDestAmount;
            }

            // TODO - check overflow
            actualSrcAmount = (actualDestAmount * PRECISION)/reserveInfo.rate;

            // do actual trade
            if( ! doSingleTrade( source,actualSrcAmount, dest, destAddress, reserveInfo.reserve, true ) ) {
                tradeInfo.tradeFailed = true;
                // trade failed in reserve
                ErrorReport( tx.origin, 0x86000002, tradeInfo.remainedSourceAmount );
                break;
            }

            // todo - check overflow
            tradeInfo.remainedSourceAmount -= actualSrcAmount;
            tradeInfo.convertedDestAmount += actualDestAmount;
        }

        if( tradeInfo.tradeFailed ) {
            if( throwOnFailure ) throw;
            if( msg.value > 0 ) {
                if( ! msg.sender.send(msg.value) ) throw;
            }

            return 0;
        }
        else {
            ErrorReport( tx.origin, 0, 0 );
            if( tradeInfo.remainedSourceAmount > 0 && source == ETH_TOKEN_ADDRESS ) {
                if( ! msg.sender.send(tradeInfo.remainedSourceAmount) ) throw;
            }



            ErrorReport( tx.origin, 0, 0 );
            Trade( msg.sender, source, dest, srcAmount-tradeInfo.remainedSourceAmount, tradeInfo.convertedDestAmount );
            return tradeInfo.convertedDestAmount;
        }
    }

    event AddReserve( KyberReserve reserve, bool add );

    /// @notice can be called only by admin
    /// @dev add or deletes a reserve to/from the network.
    /// @param reserve The reserve address.
    /// @param add If true, the add reserve. Otherwise delete reserve.
    function addReserve( KyberReserve reserve, bool add ) {
        if( msg.sender != admin ) {
            // only admin can add to reserve
            ErrorReport( msg.sender, 0x87000000, 0 );
            return;
        }

        if( add ) {
            reserves.push(reserve);
            AddReserve( reserve, true );
        }
        else {
            // will have truble if more than 50k reserves...
            for( uint i = 0 ; i < reserves.length ; i++ ) {
                if( reserves[i] == reserve ) {
                    if( reserves.length == 0 ) return;
                    reserves[i] = reserves[--reserves.length];
                    AddReserve( reserve, false );
                    break;
                }
            }
        }

        ErrorReport( msg.sender, 0, 0 );
    }

    event ListPairsForReserve( address reserve, ERC20 source, ERC20 dest, bool add );

    /// @notice can be called only by admin
    /// @dev allow or prevent a specific reserve to trade a pair of tokens
    /// @param reserve The reserve address.
    /// @param source Source token
    /// @param dest Destination token
    /// @param add If true then enable trade, otherwise delist pair.
    function listPairForReserve(address reserve, ERC20 source, ERC20 dest, bool add ) {
        if( msg.sender != admin ) {
            // only admin can add to reserve
            ErrorReport( msg.sender, 0x88000000, 0 );
            return;
        }

        (perReserveListedPairs[reserve])[sha3(source,dest)] = add;
        ListPairsForReserve( reserve, source, dest, add );
        ErrorReport( tx.origin, 0, 0 );
    }

    /// @notice can be called only by admin. still not implemented
    /// @dev upgrade network to a new contract
    /// @param newAddress The address of the new network
    function upgrade( address newAddress ) {
        // TODO
        newAddress; // unused warning
        throw;
    }

    /// @notice should be called off chain with as much gas as needed
    /// @dev get an array of all reserves
    /// @return An array of all reserves
    function getReserves( ) constant returns(KyberReserve[]) {
        return reserves;
    }


    /// @notice a debug function
    /// @dev get the balance of the network. It is expected to be 0 all the time.
    /// @param token The token type
    /// @return The balance
    function getBalance( ERC20 token ) constant returns(uint){
        if( token == ETH_TOKEN_ADDRESS ) return this.balance;
        else return token.balanceOf(this);
    }
}
