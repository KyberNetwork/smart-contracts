pragma  solidity 0.5.11;

import "../KyberMatchingEngine.sol";

// Mock Malicious MatchingEngine that can manipulate the exchange rate
// As reserve and network trust matchingEngine, reserve will trade with whatever rate
// that matchingEngine has returned to network
// So matching engine can manipulate to let user trade with higher/lower rate
// or even trade with all reserve's balance
contract MockMatchingEngineManipulateRate is KyberMatchingEngine {

    // 10000: taken all reserve, otherwise apply change to rate from reserve
    int public changePriceInBps;

    constructor(address _admin) public
        KyberMatchingEngine(_admin)
    { /* empty body */ }

    function setChangePriceInBps(int newChange) public {
        changePriceInBps = newChange;
    }

    // Return different rate from reserve's rate
    function getRateFromReserve(IKyberReserve reserve, IERC20 src, IERC20 dest, uint srcAmount) internal view returns (uint rate, uint destAmount) {
        if (changePriceInBps == 10000) { // taken all reserve's balance
            destAmount = dest == ETH_TOKEN_ADDRESS ? address(reserve).balance : dest.balanceOf(address(reserve));
            rate = calcRateFromQty(srcAmount, destAmount, getDecimals(src), getDecimals(dest));
        } else {
            rate = reserve.getConversionRate(
                src,
                dest,
                srcAmount,
                block.number
            );
            rate = rate * uint(10000 + changePriceInBps) / 10000;
            destAmount = calcDestAmount(src, dest, srcAmount, rate);
        }
    }

    function getIsFeeAccountingReserves(bytes8[] memory reserveIds) internal view
        returns(bool[] memory feePayingArr)
    {
        feePayingArr = new bool[](reserveIds.length);

        for (uint i = 0; i < reserveIds.length; i++) {
            feePayingArr[i] = (feePayingPerType & (1 << reserveType[reserveIds[i]])) > 0;
        }
    }
}
