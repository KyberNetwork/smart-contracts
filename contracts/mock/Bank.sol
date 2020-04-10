pragma solidity 0.4.18;


/*
 * @title simple contract allow send ether in and withdraw ether out
 */
contract Bank {
	function() public payable {}

	function withdraw() public {
		msg.sender.transfer(address(this).balance);
	}
}
