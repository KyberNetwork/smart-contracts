pragma solidity 0.4.18;


import "../../mockContracts/TestToken.sol";


/*
 * WethToken
 *
 * A Test token with deposit and withdraw, used to simulate WETH. 
 */
contract WethToken is TestToken {

    function WethToken(string _name, string _symbol, uint _decimals) TestToken(_name, _symbol, _decimals) public {}

    event  Deposit(address indexed dst, uint wad);

    function deposit() public payable {
        balances[msg.sender] += msg.value;
        Deposit(msg.sender, msg.value);
    }

    event  Withdrawal(address indexed src, uint wad);

    function withdraw(uint wad) public {
        require(balances[msg.sender] >= wad);
        balances[msg.sender] -= wad;
        msg.sender.transfer(wad);
        Withdrawal(msg.sender, wad);
    }
}
