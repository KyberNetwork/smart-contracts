pragma solidity ^0.4.18;


import "./ERC20Interface.sol";
import "./Withdrawable.sol";
import "./Utils.sol";

interface SanityRatesInterface {
    function getSanityRate(ERC20 src, ERC20 dest) view public returns(uint);
}


contract SanityRates is SanityRatesInterface, Withdrawable, Utils {
    mapping(address=>uint) tokenRate;
    mapping(address=>uint) reasonableDiffInBps;

    function SanityRates(address _admin) public {
        admin = _admin;
    }

    function setReasonableDiff(ERC20[] sources, uint[] diff) public onlyAdmin {
        require(sources.length == diff.length);
        for(uint i = 0; i < sources.length; i++) {
            reasonableDiffInBps[sources[i]] = diff[i];
        }
    }

    function setSanityRates(ERC20[] sources, uint[] rates) public onlyOperator {
        require(sources.length == rates.length);

        for(uint i = 0; i < sources.length; i++) {
            tokenRate[sources[i]] = rates[i];
        }
    }

    function getSanityRate(ERC20 src, ERC20 dest) view public returns(uint) {
        if(src != ETH_TOKEN_ADDRESS && dest != ETH_TOKEN_ADDRESS) return 0;

        uint rate;
        address token;
        if(src == ETH_TOKEN_ADDRESS) {
            rate = (PRECISION*PRECISION)/tokenRate[dest];
            token = dest;
        } else {
            rate = tokenRate[src];
            token = src;
        }

        return rate * (10000 + reasonableDiffInBps[token])/10000;
    }
}
