pragma solidity ^0.4.18;


import "../ERC20Interface.sol";


interface mockERC20 is ERC20 {
    function name() public view returns(string name);
    function symbol() public view returns(string symbol);
}
