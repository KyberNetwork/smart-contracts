pragma solidity 0.4.18;


import "../ERC20Interface.sol";
import "../KyberReserveInterface.sol";
import "../KyberNetwork.sol";
import "../Withdrawable.sol";
import "../Utils2.sol";
import "../PermissionGroups.sol";


////////////////////////////////////////////////////////////////////////////////////////////////////////
/// @title Kyber Network main contract that doesn't check max dest amount. so we can test it on proxy
contract KyberNetworkNoMaxDest is KyberNetwork {

    function KyberNetworkNoMaxDest(address _admin) public KyberNetwork(_admin) { }

    function calcActualAmounts (ERC20 src, ERC20 dest, uint srcAmount, uint maxDestAmount, BestRateResult rateResult)
        internal view returns(uint actualSrcAmount, uint weiAmount, uint actualDestAmount)
    {
        src;
        dest;
        maxDestAmount;

        actualDestAmount = rateResult.destAmount;
        actualSrcAmount = srcAmount;
        weiAmount = rateResult.weiAmount;
    }
}
