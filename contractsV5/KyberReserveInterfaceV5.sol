pragma solidity 0.5.11;

import "./IERC20Interface.sol";


/// @title Kyber Reserve contract
interface KyberReserveInterface {

    function trade(
        IERC20 srcToken,
        uint srcAmount,
        IERC20 destToken,
        address payable destAddress,
        uint conversionRate,
        bool validate
    )
        external
        payable
        returns(bool);

    function getConversionRate(IERC20 src, IERC20 dest, uint srcQty, uint blockNumber) external view returns(uint);
}
