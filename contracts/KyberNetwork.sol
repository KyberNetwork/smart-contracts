pragma solidity ^0.4.18;

import "./ERC20Interface.sol";
import "./KyberReserve.sol";
import "./Withdrawable.sol";
import "./KyberConstants.sol";
import "./PermissionGroups.sol";
import "./KyberWhiteList.sol";


////////////////////////////////////////////////////////////////////////////////////////////////////////

/// @title Kyber Network main contract
/// @author Yaron Velner


contract KyberNetwork is Withdrawable, KyberConstants {

    address admin;
    uint  constant EPSILON = (10);
    KyberReserve[] public reserves;
    KyberWhiteList public kyberWhiteList;

    mapping(address=>mapping(bytes32=>bool)) perReserveListedPairs;

    event ErrorReport( address indexed origin, uint error, uint errorInfo );

    /// @dev c'tor.
    /// @param _admin The address of the administrator
    function KyberNetwork( address _admin ) public {
        admin = _admin;
    }


    struct KyberReservePairInfo {
        uint rate;
        uint reserveBalance;
        KyberReserve reserve;
    }


    /// @dev returns number of reserves
    /// @return number of reserves
    function getNumReserves() public view returns(uint){
        return reserves.length;
    }

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev information on conversion rate to a front end application
    /// @param source Source token
    /// @param dest Destination token
    /// @return rate. If not available returns 0.

    function getPrice( ERC20 source, ERC20 dest, uint srcQty ) public view returns(uint) {
        uint reserve; uint rate;
        (reserve,rate) = findBestRate( source, dest, srcQty );
        return rate;
    }

    function getDecimals( ERC20 token ) public view returns(uint) {
        if( token == ETH_TOKEN_ADDRESS ) return 18;
        return token.decimals();
    }

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev best conversion rate for a pair of tokens
    /// @param source Source token
    /// @param dest Destination token
    /// @return KyberReservePairInfo structure
    function findBestRate( ERC20 source, ERC20 dest, uint srcQty ) public view returns(uint,uint) {
        uint bestRate = 0;
        uint bestReserve = 0;
        uint numReserves = reserves.length;
        uint rate = 0;
        for( uint i = 0 ; i < numReserves ; i++ ) {
            if( ! (perReserveListedPairs[reserves[i]])[keccak256(source,dest)] ) continue;

            rate = reserves[i].getConversionRate( source, dest, srcQty, block.number );
            if( rate > bestRate ) {
                bestRate = rate;
                bestReserve = i;
            }
        }

        return (bestReserve, bestRate);
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
    function doSingleTrade(
        ERC20 source,
        uint amount,
        ERC20 dest,
        address destAddress,
        uint expectedDestAmount,
        KyberReserve reserve,
        bool validate )
        internal returns(bool)
    {
        uint callValue = 0;
        if( source == ETH_TOKEN_ADDRESS ) callValue = amount;
        else {
            // take source tokens to this contract
            source.transferFrom(msg.sender, this, amount);

            // let reserve use network tokens
            source.approve( reserve, amount);
        }

        // reserve send tokens/eth to network. network sends it to destination
        assert( reserve.trade.value(callValue)(source, amount, dest, this, validate ) );

        if( dest == ETH_TOKEN_ADDRESS ) {
          destAddress.transfer(expectedDestAmount);
        }
        else {
          assert(dest.transfer(destAddress,expectedDestAmount));
        }

        return true;
    }

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev checks that user sent ether/tokens to contract before trade
    /// @param source Source token
    /// @param srcAmount amount of source tokens
    /// @return true if input is valid
    function validateTradeInput( ERC20 source, uint srcAmount ) internal returns(bool) {
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
                // insufficient allowance
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
    /// @param dest   Destination token
    /// @param destAddress Address to send tokens to
    /// @param maxDestAmount A limit on the amount of dest tokens
    /// @param minConversionRate The minimal conversion rate. If actual rate is lower, trade is canceled.
    /// @return amount of actual dest tokens
    function walletTrade(
        ERC20 source,
        uint srcAmount,
        ERC20 dest,
        address destAddress,
        uint maxDestAmount,
        uint minConversionRate,
        bytes32 walletId )
        public payable returns(uint)
    {
       // TODO - log wallet id
       walletId;
       return trade( source, srcAmount, dest, destAddress, maxDestAmount,
                     minConversionRate );
    }

    function isNegligable( uint currentValue, uint originalValue ) public pure returns(bool){
      return (currentValue < (originalValue / 1000)) || (currentValue == 0);
    }
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
        uint minConversionRate )
        public payable returns(uint)
    {
        require (kyberWhiteList != address(0));
        require( validateTradeInput( source, srcAmount ) );

        uint reserveInd; uint rate;
        (reserveInd,rate) = findBestRate(source,dest,srcAmount);
        KyberReserve theReserve = reserves[reserveInd];
        assert(rate > 0 );
        assert(rate >= minConversionRate );

        uint actualSourceAmount = srcAmount;
        uint actualDestAmount = theReserve.getDestQty( source, dest, actualSourceAmount, rate );
        if( actualDestAmount > maxDestAmount ) {
          actualDestAmount = maxDestAmount;
          actualSourceAmount = theReserve.getSrcQty( source, dest, actualDestAmount, rate );
        }

        // do the trade
        // verify trade size is smaller then user cap
        if (source == ETH_TOKEN_ADDRESS) {
          require (actualSourceAmount <= kyberWhiteList.getUserCapInWei(destAddress));
        }
        else {
          require (actualDestAmount <= kyberWhiteList.getUserCapInWei(destAddress));
        }

        assert( doSingleTrade(source,
                              actualSourceAmount,
                              dest,
                              destAddress,
                              actualDestAmount,
                              theReserve,
                              true) );

        ErrorReport( tx.origin, 0, 0 );
        Trade( msg.sender, source, dest, actualSourceAmount, actualDestAmount );
        return actualDestAmount;
    }

    event AddReserve( KyberReserve reserve, bool add );

    /// @notice can be called only by admin
    /// @dev add or deletes a reserve to/from the network.
    /// @param reserve The reserve address.
    /// @param add If true, the add reserve. Otherwise delete reserve.
    function addReserve( KyberReserve reserve, bool add ) public {
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
    function listPairForReserve( address reserve, ERC20 source, ERC20 dest, bool add ) public {
        if( msg.sender != admin ) {
            // only admin can add to reserve
            ErrorReport( msg.sender, 0x88000000, 0 );
            return;
        }

        (perReserveListedPairs[reserve])[keccak256(source,dest)] = add;
        ListPairsForReserve( reserve, source, dest, add );
        ErrorReport( tx.origin, 0, 0 );
    }

    /// @notice can be called only by admin. still not implemented
    /// @dev upgrade network to a new contract
    /// @param newAddress The address of the new network
    function upgrade( address newAddress ) public pure {
        // TODO
        newAddress; // unused warning
        revert();
    }

    /// @notice should be called off chain with as much gas as needed
    /// @dev get an array of all reserves
    /// @return An array of all reserves
    function getReserves( ) public view returns(KyberReserve[]) {
        return reserves;
    }


    /// @notice a debug function
    /// @dev get the balance of the network. It is expected to be 0 all the time.
    /// @param token The token type
    /// @return The balance
    function getBalance( ERC20 token ) public view returns(uint){
        if( token == ETH_TOKEN_ADDRESS ) return this.balance;
        else return token.balanceOf(this);
    }

    function setKyberWhiteList ( KyberWhiteList whiteList ) public onlyAdmin {
        kyberWhiteList = whiteList;
    }
}
