pragma solidity ^0.4.8;

import "./ERC20Interface.sol";
import "./KyberReserve.sol";
import "./KyberNetwork.sol";


////////////////////////////////////////////////////////////////////////////////////////////////////////

contract KyberWallet {
    address public owner;
    KyberNetwork public kyberNetwork;
    ERC20 constant public ETH_TOKEN_ADDRESS = ERC20(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);    

    event ErrorReport( address indexed origin, uint error, uint errorInfo );
    
    event NewWallet( address indexed owner, address kyberNetwork );
    function KyberWallet( KyberNetwork _kyberNetwork ) {
        owner = msg.sender;
        kyberNetwork = _kyberNetwork;
        NewWallet( msg.sender, kyberNetwork );
    }
    
    event SetKyberNetwork( address indexed sender, address network );
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
        IncomingEther( msg.sender, msg.value );
    }
    
    event ConvertAndCall( address indexed sender, address destination, uint destAmount );
    function convertAndCall( ERC20 srcToken, uint srcAmount,
                             ERC20 destToken, uint maxDestAmount,
                             uint minRate,
                             address destination,
                             bytes   destinationData,
                             bool throwOnFail,
                             bool validate ) {
                                 
        if( validate ) {
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
        else {
            destToken.approve(destination, destAmount);
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
}



