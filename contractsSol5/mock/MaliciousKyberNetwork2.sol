pragma solidity 0.5.11;

import "../KyberNetwork.sol";


/*
 * @title Kyber Network main contract, takes some fee and reports actual dest amount minus Fees.
 */
contract MaliciousKyberNetwork2 is KyberNetwork {
    uint256 public myFeeWei = 10;

    constructor(address _admin, IKyberStorage _kyberStorage)
        public
        KyberNetwork(_admin, _kyberStorage)
    {}

    function setMyFeeWei(uint256 fee) public {
        myFeeWei = fee;
    }

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev do one trade with a reserve
    /// @param src Src token
    /// @param amount amount of src tokens
    /// @param dest   Destination token
    /// @param destAddress Address to send tokens to
    /// @return true if trade is successful
    function doReserveTrades(
        IERC20 src,
        uint256 amount,
        IERC20 dest,
        address payable destAddress,
        TradeData memory tData,
        uint256 expectedDestAmount
    ) internal returns (bool) {
        if (src == dest) {
            //E2E, need not do anything except for T2E, transfer ETH to destAddress
            if (destAddress != (address(this))) destAddress.transfer(amount - myFeeWei);
            return true;
        }

        ReservesData memory reservesData = src == ETH_TOKEN_ADDRESS
            ? tData.ethToToken
            : tData.tokenToEth;
        uint256 callValue;
        uint256 srcAmountSoFar;

        for (uint256 i = 0; i < reservesData.addresses.length; i++) {
            uint256 splitAmount = i == (reservesData.splitsBps.length - 1)
                ? (amount - srcAmountSoFar)
                : (reservesData.splitsBps[i] * amount) / BPS;
            srcAmountSoFar += splitAmount;
            callValue = (src == ETH_TOKEN_ADDRESS) ? splitAmount : 0;

            // reserve sends tokens/eth to network. network sends it to destination
            require(
                reservesData.addresses[i].trade.value(callValue)(
                    src,
                    splitAmount,
                    dest,
                    address(this),
                    reservesData.rates[i],
                    true
                )
            );
        }

        if (destAddress != address(this)) {
            dest.safeTransfer(destAddress, (expectedDestAmount - myFeeWei));
        }

        return true;
    }
}
