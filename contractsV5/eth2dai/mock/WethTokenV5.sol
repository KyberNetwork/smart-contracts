
pragma solidity 0.5.11;

import "./TestTokenV5.sol";

contract IWethToken is TestTokenV5 {

    constructor(string memory _name, string memory _symbol, uint _decimals) TestTokenV5(_name, _symbol, _decimals) public {}

    event Deposit(address indexed dst, uint wad);

    function deposit() public payable {
        balances[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);
    }

    event Withdrawal(address indexed src, uint wad);

    function withdraw(uint wad) public {
        require(balances[msg.sender] >= wad);
        balances[msg.sender] -= wad;
        msg.sender.transfer(wad);
        emit Withdrawal(msg.sender, wad);
    }
}
