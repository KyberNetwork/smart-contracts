pragma solidity 0.6.6;

import "./MaliciousKyberNetwork.sol";


/*
 * @title Kyber Network main contract, takes some fee and reports actual dest amount minus Fees.
 */
contract MaliciousKyberNetwork2 is MaliciousKyberNetwork {
    
    constructor(address _admin, IKyberStorage _kyberStorage)
        public
        MaliciousKyberNetwork(_admin, _kyberStorage)
    {
        myFeeWei = 10;
    }

    function doReserveTrades(
        IERC20 src,
        uint256 amount,
        IERC20 dest,
        address payable destAddress,
        ReservesData memory reservesData,
        uint256 expectedDestAmount,
        uint256 srcDecimals,
        uint256 destDecimals
    ) internal override {
        if (src == dest) {
            //E2E, need not do anything except for T2E, transfer ETH to destAddress
            if (destAddress != (address(this))) destAddress.transfer(amount - myFeeWei);
            return;
        }

        srcDecimals;
        destDecimals;

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
                reservesData.addresses[i].trade{value: callValue}(
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

        return;
    }
}
