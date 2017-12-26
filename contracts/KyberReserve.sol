pragma solidity ^0.4.18;


import "./ERC20Interface.sol";
import "./KyberConstants.sol";
import "./Withdrawable.sol";
import "./Pricing.sol";
import "./VolumeImbalanceRecorder.sol";

/// @title Kyber Reserve contract
/// @author Yaron Velner


contract KyberReserve is KyberConstants, Pricing {

    address public kyberNetwork;
    bool public tradeEnabled;

    function KyberReserve( address _kyberNetwork, address _admin ) public {
        kyberNetwork = _kyberNetwork;
        admin = _admin;
        tradeEnabled = true;
    }


    function getDecimals( ERC20 token ) public view returns(uint) {
      if( token == ETH_TOKEN_ADDRESS ) return 18;
      return token.decimals();
    }

    function getDestQty( ERC20 source, ERC20 dest, uint srcQty, uint rate ) public view returns(uint){
      // TODO - check overflow
      return (srcQty * rate * (10 ** getDecimals(dest)) / (10**getDecimals(source))) / PRECISION;
    }

    function getSrcQty( ERC20 source, ERC20 dest, uint dstQty, uint rate ) public view returns(uint){
      // TODO - check overflow
      return PRECISION * dstQty * (10**getDecimals(source)) / (rate*(10 ** getDecimals(dest)));
    }

    function getConversionRate( ERC20 source, ERC20 dest, uint srcQty, uint blockNumber ) public view returns(uint) {
        ERC20 token;
        bool  buy;
        uint  tokenQty;

        if( ETH_TOKEN_ADDRESS == source ) {
          buy = true;
          token = dest;
          tokenQty = getDestQty( source,dest,srcQty,getBasicPrice(token,true));
        }
        else if( ETH_TOKEN_ADDRESS == dest ){
          buy = false;
          token = source;
          tokenQty = srcQty;
        }
        else return 0; // pair is not listed

        uint price = getPrice( token, blockNumber, buy, tokenQty );
        uint destQty = getDestQty( source,dest,srcQty,price);
        if( getBalance(dest) < destQty ) return 0;

        return price;
    }

    event DoTrade( address indexed origin, address source, uint sourceAmount, address destToken, uint destAmount, address destAddress );

    /// @dev do a trade
    /// @param sourceToken Source token
    /// @param sourceAmount Amount of source token
    /// @param destToken Destination token
    /// @param destAddress Destination address to send tokens to
    /// @param validate If true, additional validations are applicable
    /// @return true iff trade is successful
    function doTrade(
        ERC20 sourceToken,
        uint sourceAmount,
        ERC20 destToken,
        address destAddress,
        bool validate )
        internal returns(bool)
    {
        uint conversionRate = getConversionRate( sourceToken, destToken, sourceAmount,  block.number );
        // can skip validation if done at kyber network level
        if( validate ) {
            require(conversionRate > 0);
            if( sourceToken == ETH_TOKEN_ADDRESS ) require( msg.value == sourceAmount );
            else require( msg.value == 0 );
        }

        uint destAmount = getDestQty( sourceToken, destToken, sourceAmount, conversionRate );

        // sanity check
        require( destAmount > 0 );

        // add to imbalance
        ERC20 token;
        int buy;
        if( sourceToken == ETH_TOKEN_ADDRESS ) {
          buy = int(destAmount);
          token = destToken;
        }
        else {
          buy = -1 * int(destAmount);
          token = sourceToken;
        }

        addImbalance( token,
                      buy,
                      getPriceUpdateBlock(token),
                      block.number );

        // collect source tokens
        if( sourceToken != ETH_TOKEN_ADDRESS ) {
            assert( sourceToken.transferFrom(msg.sender,this,sourceAmount) );
        }

        // send dest tokens
        if( destToken == ETH_TOKEN_ADDRESS ) {
            destAddress.transfer(destAmount);
        }
        else {
            assert( destToken.transfer(destAddress, destAmount) );
        }

        DoTrade( tx.origin, sourceToken, sourceAmount, destToken, destAmount, destAddress );

        return true;
    }

    function trade(
        ERC20 sourceToken,
        uint sourceAmount,
        ERC20 destToken,
        address destAddress,
        bool validate )
        public payable returns(bool)
    {
        require( tradeEnabled );
        require( msg.sender == kyberNetwork );

        assert( doTrade( sourceToken, sourceAmount, destToken, destAddress, validate ) );

        return true;
    }


    event EnableTrade( bool enable );

    function enableTrade( ) public onlyAdmin returns(bool){
        tradeEnabled = true;
        EnableTrade( true );

        return true;
    }

    function disableTrade( ) public onlyAlerter returns(bool){
        tradeEnabled = false;
        EnableTrade( false );

        return true;
    }


    event DepositToken( ERC20 token, uint amount );
    function() payable public {
        DepositToken( ETH_TOKEN_ADDRESS, msg.value );
    }

    event Withdraw( ERC20 token, uint amount, address destination );

    /// @notice can only be called by owner.
    /// @dev withdraw tokens or ether from contract
    /// @param token Token address
    /// @param amount Amount of tokens to deposit
    /// @param destination address that gets withdrawn funds
    /// @return true iff withdrawal is successful
    function withdraw( ERC20 token, uint amount, address destination ) public onlyOperator returns(bool) {

        if( token == ETH_TOKEN_ADDRESS ) {
            destination.transfer(amount);
        }
        else if( ! token.transfer(destination,amount) ) {
            // transfer to reserve owner failed
            return false;
        }

        Withdraw( token, amount, destination );
    }

    ////////////////////////////////////////////////////////////////////////////
    /// status functions ///////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////

    function getBalance( ERC20 token ) public view returns(uint){
        if( token == ETH_TOKEN_ADDRESS ) return this.balance;
        else return token.balanceOf(this);
    }
}
