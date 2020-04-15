pragma solidity 0.5.11;

import "../../../mock/Token.sol";


contract WethTokenV5 is Token {
    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _decimals
    ) public Token(_name, _symbol, _decimals) {}

    event Deposit(address indexed dst, uint256 wad);

    function deposit() public payable {
        balances[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);
    }

    event Withdrawal(address indexed src, uint256 wad);

    function withdraw(uint256 wad) public {
        require(balances[msg.sender] >= wad);
        balances[msg.sender] -= wad;
        msg.sender.transfer(wad);
        emit Withdrawal(msg.sender, wad);
    }
}
