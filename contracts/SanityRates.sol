pragma solidity ^0.4.18;


import "./ERC20Interface.sol";
import "./Withdrawable.sol";


interface SanityRatesInterface {
    function getSanityRate(ERC20 src, ERC20 dest) view public returns(uint);
}


contract SanityRates is SanityRatesInterface, Withdrawable {
    mapping(bytes32=>uint) rates;

    function SanityRates(address _admin) public {
        admin = _admin;
    }

    function setSanityRates(ERC20[] sources, ERC20[] dests, uint[] _rates) public onlyOperator {
        require(sources.length == dests.length);
        require(dests.length == _rates.length);

        for(uint i = 0; i < sources.length; i++) {
            rates[keccak256(sources[i], dests[i])] = _rates[i];
        }
    }

    function getSanityRate(ERC20 src, ERC20 dest) view public returns(uint) {
        return rates[keccak256(src, dest)];
    }
}
