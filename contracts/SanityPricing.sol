pragma solidity ^0.4.18;


import "./ERC20Interface.sol";
import "./Withdrawable.sol";


interface SanityPricingInterface {
    function getSanityPrice(ERC20 src, ERC20 dest) view public returns(uint);
}


contract SanityPricing is SanityPricingInterface, Withdrawable {
    mapping(bytes32=>uint) prices;

    function SanityPricing(address _admin) public {
        admin = _admin;
    }

    function setSanityPrices(ERC20[] sources, ERC20[] dests, uint[] rates) public onlyOperator {
        require(sources.length == dests.length);
        require(dests.length == rates.length);

        for(uint i = 0; i < sources.length; i++) {
            prices[keccak256(sources[i],dests[i])] = rates[i];
        }
    }

    function getSanityPrice(ERC20 src, ERC20 dest) view public returns(uint) {
        return prices[keccak256(src,dest)];
    }
}
