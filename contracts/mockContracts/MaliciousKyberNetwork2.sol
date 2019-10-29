pragma solidity 0.4.18;


import "../KyberNetwork.sol";


////////////////////////////////////////////////////////////////////////////////////////////////////////
/// @title Kyber Network main contract that takes some fee but returns actual dest amount as if FEE wasn't taken.
contract MaliciousKyberNetwork2 is KyberNetwork {

    address public myWallet = 0x1234;
    uint public myFeeWei = 10;

    function MaliciousKyberNetwork2(address _admin) public KyberNetwork(_admin) { }

    function setMyFeeWei(uint fee) public {
        myFeeWei = fee;
    }

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev do one trade with a reserve
    /// @param src Src token
    /// @param amount amount of src tokens
    /// @param dest   Destination token
    /// @param destAddress Address to send tokens to
    /// @param reserve Reserve to use
    /// @param validate If true, additional validations are applicable
    /// @return true if trade is successful
    function doReserveTrade(
        ERC20 src,
        uint amount,
        ERC20 dest,
        address destAddress,
        uint expectedDestAmount,
        KyberReserveInterface reserve,
        uint conversionRate,
        bool validate
    )
        internal
        returns(bool)
    {
        uint callValue = 0;

        if (src == dest) {
            //this is for a "fake" trade when both src and dest are ethers.
            if (destAddress != (address(this))) {
                destAddress.transfer(amount - myFeeWei);
                myWallet.transfer(myFeeWei);
            }
            return true;
        }

        if (src == ETH_TOKEN_ADDRESS) {
            callValue = amount;
        }

        // reserve sends tokens/eth to network. network sends it to destination
        require(reserve.trade.value(callValue)(src, amount, dest, this, conversionRate, validate));

        if (destAddress != address(this)) {

            //for token to token dest address is network. and Ether / token already here...
            if (dest == ETH_TOKEN_ADDRESS) {
                destAddress.transfer(expectedDestAmount);
            } else {
                require(dest.transfer(destAddress, (expectedDestAmount - myFeeWei)));
                dest.transfer(myWallet, myFeeWei);
            }
        }

        return true;
    }
}
