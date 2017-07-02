pragma solidity ^0.4.8;

import "./ERC20Interface.sol";

contract KyberReserve {
    address reserveOwner;
    address kyberNetwork;
    ERC20 constant public ETH_TOKEN_ADDRESS = ERC20(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);
    uint  constant PRECISION = (10**18);
    bool public tradeEnabled;

    struct ConversionRate {
        uint rate;
        uint expirationBlock;
    }
    
    mapping(bytes32=>ConversionRate) pairConversionRate;
    

    function KyberReserve( address _kyberNetwork, address _reserveOwner ) {
        kyberNetwork = _kyberNetwork;
        reserveOwner = _reserveOwner;
        tradeEnabled = true;
    }
    
    
    function isPairListed( ERC20 source, ERC20 dest, uint blockNumber ) internal constant returns(bool) {
        ConversionRate memory rateInfo = pairConversionRate[sha3(source,dest)];
        if( rateInfo.rate == 0 ) return false;
        return rateInfo.expirationBlock >= blockNumber;
    }
    
    function getConversionRate( ERC20 source, ERC20 dest, uint blockNumber ) internal constant returns(uint) {
        ConversionRate memory rateInfo = pairConversionRate[sha3(source,dest)];
        if( rateInfo.rate == 0 ) return 0;
        if( rateInfo.expirationBlock < blockNumber ) return 0;
        return rateInfo.rate;
    }
    
    event ErrorReport( address indexed origin, uint error, uint errorInfo );
    event DoTrade( address indexed origin, address source, uint sourceAmount, address destToken, uint destAmount, address destAddress );
    
    function doTrade( ERC20 sourceToken,
                      uint sourceAmount,
                      ERC20 destToken,
                      address destAddress,
                      bool validate ) internal returns(bool) {

        // can skip validation if done at kyber network level        
        if( validate ) {
            if( ! isPairListed( sourceToken, destToken, block.number ) ) {
                // pair is not listed
                ErrorReport( tx.origin, 0x800000001, 0 );
                return false;
                
            }
            if( sourceToken == ETH_TOKEN_ADDRESS ) {
                if( msg.value != sourceAmount ) {
                    // msg.value != sourceAmmount
                    ErrorReport( tx.origin, 0x800000002, msg.value );
                    return false;
                }
            }
            else if( msg.value > 0 ) {
                // msg.value must be 0
                ErrorReport( tx.origin, 0x800000003, msg.value );
                return false;
            }
            else if( sourceToken.allowance(msg.sender, this ) < sourceAmount ) {
                // allowance is not enough
                ErrorReport( tx.origin, 0x800000004, sourceToken.allowance(msg.sender, this ) );
                return false;
            }
        }
        
        uint conversionRate = getConversionRate( sourceToken, destToken, block.number );
        // TODO - safe multiplication
        uint destAmount = (conversionRate * sourceAmount) / PRECISION;

        // sanity check            
        if( destAmount == 0 ) {
            // unexpected error: dest amount is 0
            ErrorReport( tx.origin, 0x800000005, 0 );
            return false;
        }
        
        // check for sufficient balance
        if( destToken == ETH_TOKEN_ADDRESS ) {
            if( this.balance < destAmount ) {
                // insufficient ether balance
                ErrorReport( tx.origin, 0x800000006, destAmount );
                return false;
            }
        }
        else {
            if( destToken.balanceOf(this) < destAmount ) {
                // insufficient token balance
                ErrorReport( tx.origin, 0x800000007, uint(destToken) );
                return false;
            }
        }
        
        // collect source tokens
        if( sourceToken != ETH_TOKEN_ADDRESS ) {
            if( ! sourceToken.transferFrom(msg.sender,this,sourceAmount) ) {
                // transfer from source token failed
                ErrorReport( tx.origin, 0x800000008, uint(sourceToken) );
                return false;
            }
        }
        
        // send dest tokens
        if( destToken == ETH_TOKEN_ADDRESS ) {
            if( ! destAddress.send(destAmount) ) {
                // transfer ether to dest failed
                ErrorReport( tx.origin, 0x800000009, uint(destAddress) );
                return false;
            }
        }
        else {
            if( ! destToken.transfer(destAddress, destAmount) ) {
                // transfer token to dest failed
                ErrorReport( tx.origin, 0x80000000a, uint(destAddress) );
                return false;
            }
        }
        
        DoTrade( tx.origin, sourceToken, sourceAmount, destToken, destAmount, destAddress );        
        
        return true;
    }
    
    function trade( ERC20 sourceToken,
                    uint sourceAmount,
                    ERC20 destToken,
                    address destAddress,
                    bool validate ) payable returns(bool) {

        if( ! tradeEnabled ) {
            // trade is not enabled
            ErrorReport( tx.origin, 0x810000000, 0 );
            if( msg.value > 0 ) {
                if( ! msg.sender.send(msg.value) ) throw;
            }
            return false;
        }

        if( msg.sender != kyberNetwork ) {
            // sender must be kyber network
            ErrorReport( tx.origin, 0x810000001, uint(msg.sender) );
            if( msg.value > 0 ) {
                if( ! msg.sender.send(msg.value) ) throw;
            }
            
            return false;
        }
        
        if( ! doTrade( sourceToken, sourceAmount, destToken, destAddress, validate ) ) {
            // do trade failed
            ErrorReport( tx.origin, 0x810000002, 0 );
            if( msg.value > 0 ) {
                if( ! msg.sender.send(msg.value) ) throw;
            }
            return false;
        }
        
        ErrorReport( tx.origin, 0, 0 );
        return true;
    }
    
    event SetRate( ERC20 source, ERC20 dest, uint rate, uint expiryBlock );
    function setRate( ERC20[] sources, ERC20[] dests, uint[] conversionRates, uint[] expiryBlocks, bool vaildate ) returns(bool) {
        if( msg.sender != reserveOwner ) {
            // sender must be reserve owner
            ErrorReport( tx.origin, 0x820000000, uint(msg.sender) );
            return false;
        }
        
        if( vaildate ) {
            if( ( sources.length != dests.length ) ||
                ( sources.length != conversionRates.length ) ||
                ( sources.length != expiryBlocks.length ) ) {
                // arrays length are not identical
                ErrorReport( tx.origin, 0x820000001, 0 );
                return false;
            }
        }
        
        for( uint i = 0 ; i < sources.length ; i++ ) {
            SetRate( sources[i], dests[i], conversionRates[i], expiryBlocks[i] );
            pairConversionRate[sha3(sources[i],dests[i])] = ConversionRate( conversionRates[i], expiryBlocks[i] );               
        }
        
        ErrorReport( tx.origin, 0, 0 );
        return true;
    }

    event EnableTrade( bool enable );
    function enableTrade( bool enable ) returns(bool){
        if( msg.sender != reserveOwner ) {
            // sender must be reserve owner
            ErrorReport( tx.origin, 0x830000000, uint(msg.sender) );
            return false;
        }
        
        tradeEnabled = enable;
        ErrorReport( tx.origin, 0, 0 );
        EnableTrade( enable );
        
        return true;
    }

    event DepositToken( ERC20 token, uint amount );
    function depositEther( ) payable returns(bool) {
        if( msg.sender != reserveOwner ) {
            // sender must be reserve owner
            ErrorReport( tx.origin, 0x840000000, uint(msg.sender) );
            if( msg.value > 0 ) {
                if( ! msg.sender.send(msg.value) ) throw;
            }
            return false;
        }
        
        ErrorReport( tx.origin, 0, 0 );        
        
        DepositToken( ETH_TOKEN_ADDRESS, msg.value );
        return true;
    }
    
    function depositToken( ERC20 token, uint amount ) returns(bool) {
        if( msg.sender != reserveOwner ) {
            // sender must be reserve owner
            ErrorReport( tx.origin, 0x850000000, uint(msg.sender) );
            return false;
        }

        if( token.allowance( msg.sender, this ) < amount ) {
            // allowence is smaller then amount
            ErrorReport( tx.origin, 0x850000001, token.allowance( msg.sender, this ) );
            return false;
        }
        
        if( ! token.transferFrom(msg.sender, this, amount ) ) {
            // transfer from failed
            ErrorReport( tx.origin, 0x850000002, uint(token) );
            return false;
        }
        
        DepositToken( token, amount );
        return true;
    }
    
    
    event Withdraw( ERC20 token, uint amount );
    function withdraw( ERC20 token, uint amount ) returns(bool) {
        if( msg.sender != reserveOwner ) {
            // sender must be reserve owner
            ErrorReport( tx.origin, 0x860000000, uint(msg.sender) );
            return false;
        }
        
        if( token == ETH_TOKEN_ADDRESS ) {
            if( ! reserveOwner.send(amount) ) throw;
        }
        else if( ! token.transfer(reserveOwner,amount) ) {
            // transfer to reserve owner failed
            ErrorReport( tx.origin, 0x860000001, uint(token) );
            return false;
        }
        
        ErrorReport( tx.origin, 0, 0 );
        Withdraw( token, amount );
    }
    
    
    ////////////////////////////////////////////////////////////////////////////
    /// status functions ///////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////
    
    // returns (rate, block expiration, balance of dest)    
    function getPairInfo( ERC20 source, ERC20 dest ) constant returns(uint[3]) {
        ConversionRate memory rateInfo = pairConversionRate[sha3(source,dest)];
        uint balance;
        if( dest == ETH_TOKEN_ADDRESS ) balance = this.balance;
        else balance = dest.balanceOf(this);
        
        return [rateInfo.rate, rateInfo.expirationBlock, balance];
    }
    
    function getBalance( ERC20 token ) constant returns(uint){
        if( token == ETH_TOKEN_ADDRESS ) return this.balance;
        else return token.balanceOf(this);
    }
}



