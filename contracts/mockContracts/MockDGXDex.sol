pragma solidity ^0.4.18;

//ask:
//dst address change?
//should init another token outside in test?

// blocknumber + 5 >= current block number ? revert
// signatures - skip for now.

import "../ERC20Interface.sol";
import "../Withdrawable.sol";


/// @title Mock Digix DEX
/// @author Tal Baneth
/// @dev a dummy contract that simulates Digix contract for purchase/sell with verified signatures. 
contract MockDGXDEX is Withdrawable {
	uint  constant internal G_TO_MG = (10**3);
	uint  constant internal DGX_DECIMALS = (10**9);
	
	ERC20 token;
	address feedSigner;
	
	function MockDGXDEX(ERC20 _token, address _feedSigner, address _admin) public {
		admin = _admin;
		token = _token;
		feedSigner = _feedSigner;
	}
	
	function () public payable {}
	
	event Purchase(bool success, uint256 purchasedAmount);
	
	function purchase(uint256 /* block_number */,
	    			  uint256 /* nonce */,
	    			  uint256 weiPerDgxMg,
	    			  uint256 /* signer */,
	    			  bytes /* signature */ ) payable public returns (bool success, uint256 purchasedAmount) {

		uint256 tokenAmount;
	
		// TODO: block nubmber validation
		// TODO: signatures validation
		
		tokenAmount = (msg.value / weiPerDgxMg) * ( DGX_DECIMALS / G_TO_MG);
		require(token.transfer(msg.sender, tokenAmount));

		success = true;
		purchasedAmount = tokenAmount;
		
		Purchase(success, purchasedAmount);
		
	}
 
 	event Sell(bool success, uint256 amountWei);
    event Stam(uint256 amount, uint256 dgx_decimals, uint256 value);
 	
   
	function sell(uint256 amount,
	    		  uint256 /* block_number */,
	    	      uint256 /* nonce */,
	    		  uint256 weiPerDgxMg,
	    		  uint256 /* signer */,
	    		  bytes /* signature */) public returns (bool success) {
	    
	    uint256 amountWei;
	    
	    // TODO: signatures validation
	    
	   // uint256 value = (amount / DGX_DECIMALS);
	    //Stam(amount, DGX_DECIMALS, value);
	    
	    amountWei = amount * G_TO_MG * weiPerDgxMg / DGX_DECIMALS;
        require(token.transferFrom(msg.sender, this, amount));
        msg.sender.transfer(amountWei);
		
		success = true;

		Sell(success, amountWei);
		
	}
}