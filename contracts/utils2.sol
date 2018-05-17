pragma solidity 0.4.18;


import "./Utils.sol";


contract utils2 is utils{
    function setDecimals(ERC20 token) internal {
        if (token == ETH_TOKEN_ADDRESS) decimals[token] = ETH_DECIMALS;
        else decimals[token] = getDecimalsBetter(token);
    }


    function getDecimalsBetter(ERC20 token) external view returns(uint) {
        bytes memory data = abi.encodeWithSignature("decimals()");
        uint[1] memory value;
        if(!address(token).call(data)) {
            // call failed
            return 18;
        }
        else {
            assembly {
                returndatacopy(value,0,returndatasize)

            }

            return value[0];
        }
    }
}
