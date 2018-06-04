pragma solidity 0.4.18;


import "./Utils.sol";


contract Utils2 is Utils{
    function setDecimals(ERC20 token) internal {
        if (token == ETH_TOKEN_ADDRESS) decimals[token] = ETH_DECIMALS;
        else decimals[token] = betterGetDecimals(token);
    }

    function decimalGetterSetter(ERC20 token) internal returns(uint decimal) {

        if (decimals[token] > 0)
            return decimals[token];
        else
            return betterGetDecimals(token);
    }

    function betterGetDecimals(ERC20 token) internal returns(uint) {
        uint[1] memory value;

        if(!address(token).call(bytes4(keccak256("decimals()")))) {
            // call failed
            decimals[token] = 18;
            return 18;
        } else {
            assembly {
                returndatacopy(value, 0, returndatasize)
            }
            decimals[token] = uint(value[0]);
            return value[0];
        }
    }

    /// @dev get the balance of a user.
    /// @param token The token type
    /// @return The balance
    function getBalance(ERC20 token, address user) public view returns(uint) {
        if (token == ETH_TOKEN_ADDRESS)
            return user.balance;
        else
            return token.balanceOf(user);
    }

    function calcDestAmount(ERC20 src, ERC20 dest, uint srcAmount, uint rate) internal view returns(uint) {
        if (src == dest) return srcAmount;
        return calcDstQty(srcAmount, getDecimals(src), getDecimals(dest), rate);
    }

    function calcSrcAmount(ERC20 src, ERC20 dest, uint destAmount, uint rate) internal view returns(uint) {
        return calcSrcQty(destAmount, getDecimals(src), getDecimals(dest), rate);
    }

    function calcRateFromQty(uint srcAmount, uint destQty, uint srcDecimals, uint dstDecimals) internal pure returns(uint) {
        require(srcAmount <= MAX_QTY);
        require(destQty <= MAX_QTY);

        if (dstDecimals >= srcDecimals) {
            require((dstDecimals - srcDecimals) <= MAX_DECIMALS);
            return (destQty * PRECISION / ((10**(dstDecimals - srcDecimals)) * srcAmount));
        } else {
            require((srcDecimals - dstDecimals) <= MAX_DECIMALS);
            return (destQty * PRECISION * (10**(srcDecimals - dstDecimals)) / srcAmount);
        }
    }
}
