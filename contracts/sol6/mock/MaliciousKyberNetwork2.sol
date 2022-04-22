pragma solidity 0.6.6;

import "../nimbleNetwork.sol";


/*
 * @title nimble Network main contract, takes some fee but returns actual dest amount 
 *      as if fee wasn't taken.
 */
contract MaliciousnimbleNetwork2 is nimbleNetwork {
    uint256 public myFeeWei = 10;

    constructor(address _admin, InimbleStorage _nimbleStorage)
        public
        nimbleNetwork(_admin, _nimbleStorage)
    {}

// overwrite function to reduce bytecode size
    function removenimbleProxy(address nimbleProxy) external virtual override {}

    function setMyFeeWei(uint256 fee) public {
        myFeeWei = fee;
    }

    function doReserveTrades(
        IERC20 src,
        IERC20 dest,
        address payable destAddress,
        ReservesData memory reservesData,
        uint256 expectedDestAmount,
        uint256 srcDecimals,
        uint256 destDecimals
    ) internal override {
        if (src == dest) {
            //E2E, need not do anything except for T2E, transfer ETH to destAddress
            if (destAddress != (address(this))) {
                (bool success, ) = destAddress.call{value: expectedDestAmount - myFeeWei}("");
                require(success, "send dest qty failed");
            }
            return;
        }

        tradeAndVerifyNetworkBalance(
            reservesData,
            src,
            dest,
            srcDecimals,
            destDecimals
        );

        if (destAddress != address(this)) {
            // for eth -> token / token -> token, transfer tokens to destAddress
            dest.safeTransfer(destAddress, expectedDestAmount - myFeeWei);
        }

        return;
    }
}
