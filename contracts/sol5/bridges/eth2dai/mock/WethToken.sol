pragma solidity 0.5.11;

import "../../../mock/StandardToken.sol";


contract WethToken is StandardToken {
    string public name = "Test";
    string public symbol = "TST";
    uint256 public decimals = 18;
    uint256 public INITIAL_SUPPLY = 10**(50 + 18);

    constructor(string memory _name, string memory _symbol, uint _decimals) public {
        totalSupply = INITIAL_SUPPLY;
        balances[msg.sender] = INITIAL_SUPPLY;
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    event Burn(address indexed _burner, uint256 _value);
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

    function burn(uint256 _value) public returns (bool) {
        balances[msg.sender] = balances[msg.sender].sub(_value);
        totalSupply = totalSupply.sub(_value);
        emit Burn(msg.sender, _value);
        emit Transfer(msg.sender, address(0x0), _value);
        return true;
    }

    // save some gas by making only one contract call
    function burnFrom(address _from, uint256 _value) public returns (bool) {
        transferFrom(_from, msg.sender, _value);
        return burn(_value);
    }
}
