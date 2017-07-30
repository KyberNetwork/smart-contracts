pragma solidity ^0.4.8;

import "./ERC20Interface.sol";
import "./KyberReserve.sol";
import "./KyberNetwork.sol";


////////////////////////////////////////////////////////////////////////////////////////////////////////

/// @title Kyber Wallet contract
/// @author Yaron Velner

contract KyberWallet {
    address public owner;
    KyberNetwork public kyberNetwork;
    ERC20 constant public ETH_TOKEN_ADDRESS = ERC20(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);    

    event ErrorReport( address indexed origin, uint error, uint errorInfo );
    
    event NewWallet( address indexed owner, address kyberNetwork );
    
    /// @dev c'tor.
    /// @param _kyberNetwork The address of kyber network        
    function KyberWallet( KyberNetwork _kyberNetwork ) {
        owner = msg.sender;
        kyberNetwork = _kyberNetwork;
        NewWallet( msg.sender, kyberNetwork );
    }
    
    event SetKyberNetwork( address indexed sender, address network );
    /// @notice can be called only by owner    
    /// @dev change kyber network to a new address
    /// @param network The address of the new kyber network            
    function setKyberNetwork( KyberNetwork network ) {
        if( msg.sender != owner ) {
            ErrorReport( msg.sender, 0x8900000, uint(owner) );
            return;
        }
        
        kyberNetwork = network;
        ErrorReport( msg.sender, 0, 0 );
        SetKyberNetwork( msg.sender, network );
    }
    
    event IncomingEther( address sender, uint amountInWei );
    function() payable {
        return recieveEther();
    }

    /// @notice it is possible to deposit ether also without this function    
    /// @dev an auxilary function that allow user to recieve ether    
    function recieveEther() payable {
        IncomingEther( msg.sender, msg.value );    
    }
    
    event IncomingTokens( address from, ERC20 token, uint amount );
    /// @notice it is possible to deposit tokens also without this function    
    /// @dev an auxilary function that allow user to recieve tokens
    /// @param token Token type
    /// @param from Sender address
    /// @param amount Amount of sent tokens        
    function recieveTokens( ERC20 token, address from, uint amount ) {
        if( ! token.transferFrom(from, this, amount ) ) {
            ErrorReport( msg.sender, 0x8a00000, uint(owner) );
            return;            
        }
        
        IncomingTokens( from, token, amount );
    }
    
    
    event ConvertAndCall( address indexed sender, address destination, uint destAmount );
    /// @notice use token address ETH_TOKEN_ADDRESS for ether. should be called only by owner    
    /// @dev convert srcToken to destToken and use it converted tokens to make a call to a contract 
    /// @param srcToken Source token type
    /// @param srcAmount Source amount
    /// @param destToken Destination token
    /// @param maxDestAmount Maximum amount of tokens to send
    /// @param minRate Minimal conversion rate. If such rate is not available then conversion is canceled
    /// @param destination Destination address to send tokens to
    /// @param destinationData Data that is associated to the destination contract call
    /// @param onlyApproveTokens If true, do not transfer tokens to dest address, instead just approve tokens to dest contract.
    /// @param throwOnFail if true, then function throws upon failure            
    function convertAndCall( ERC20 srcToken, uint srcAmount,
                             ERC20 destToken, uint maxDestAmount,
                             uint minRate,
                             address destination,
                             bytes   destinationData,
                             bool onlyApproveTokens,
                             bool throwOnFail ) {
        if( msg.sender != owner ) {
            ErrorReport( msg.sender, 0x8a0000f, uint(owner) );
            return;
        }
                                 
        if( true ) {
            if( srcToken == ETH_TOKEN_ADDRESS ) {
                if( this.balance < srcAmount ) {
                    // balance < srcAmount
                    ErrorReport( msg.sender, 0x8a00000, this.balance );
                    return;
                }
            }
            else {
                if( srcToken.balanceOf(this) < srcAmount ) {
                    // msg.value < srcAmount
                    ErrorReport( msg.sender, 0x8a00001, srcToken.balanceOf(this) );
                    return;
                }
            }
        }

        uint valueForKyberNetwork = 0;
        if( srcToken == ETH_TOKEN_ADDRESS ) valueForKyberNetwork = srcAmount;
        else {
            srcToken.approve(kyberNetwork, srcAmount);
        }
        
        // do trade
        uint destAmount = kyberNetwork.trade.value(valueForKyberNetwork)(srcToken, srcAmount, destToken, this, maxDestAmount, minRate, throwOnFail );
        if( destAmount == 0 ) {
            // trade failed
            ErrorReport( msg.sender, 0x8a00002, 0 );
            return;
        }
        
        // reset allowance
        if( srcToken != ETH_TOKEN_ADDRESS ) {
            srcToken.approve(kyberNetwork, 0 );
        }
        
        // call destination
        uint valueForCall = 0;
        if( destToken == ETH_TOKEN_ADDRESS ) {
            valueForCall = destAmount;
        }
        else if( onlyApproveTokens ) {
            destToken.approve(destination, destAmount);
        }
        else {
            destToken.transfer(destination, destAmount);
        }
        
        if( ! destination.call.value(valueForCall)(destinationData) ) {
            // call to function
            ErrorReport( msg.sender, 0x8a00003, 0 );
            if( throwOnFail ) throw;
            // this address cannot be trusted
            destToken.approve(destination, 0);
            return;
        }
        
        if( destToken != ETH_TOKEN_ADDRESS ) {
            destToken.approve(destination, 0);
        }
        
        ErrorReport( msg.sender, 0, 0 );
        ConvertAndCall( msg.sender, destination, destAmount );
    }

    /// @notice should be called only by owner    
    /// @dev execute a tx. For example, send tokens/ether to other address. Or make a contract call. 
    /// @param to Destination address
    /// @param value Ether value to send (when sending tokens should be 0)
    /// @param data Data that is associated to the call
    function execute( address to, uint value, bytes data ) {
        if( msg.sender != owner ) {
            ErrorReport( msg.sender, 0x8b00000, uint(owner) );
            return;
        }
        
        if( ! to.call.value(value)(data) ) {
            ErrorReport( msg.sender, 0x8b00001, uint(owner) );
            return;        
        }
        
        ErrorReport( msg.sender, 0, 0 );        
    
        return;
    }
}



