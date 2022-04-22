pragma solidity 0.6.6;

import "../InimbleNetworkProxy.sol";


contract MockTrader {
    IERC20 internal constant ETH_TOKEN_ADDRESS = IERC20(
        0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE
    );
    InimbleNetworkProxy public nimbleNetworkProxy;

    constructor(InimbleNetworkProxy _nimbleNetworkProxy) public {
        nimbleNetworkProxy = _nimbleNetworkProxy;
    }

    function tradeWithHintAndFee(
        IERC20 src,
        uint256 srcAmount,
        IERC20 dest,
        address payable destAddress,
        address payable platformWallet,
        uint256 platformFeeBps,
        bytes calldata hint
    ) external payable returns (uint256 destAmount) {
        if (src != ETH_TOKEN_ADDRESS) {
            require(src.transferFrom(msg.sender, address(this), srcAmount));
            require(src.approve(address(nimbleNetworkProxy), srcAmount));
        }

        uint256 rate = nimbleNetworkProxy.getExpectedRateAfterFee(
            src,
            dest,
            srcAmount,
            platformFeeBps,
            hint
        );

        return
            nimbleNetworkProxy.tradeWithHintAndFee{value: msg.value}(
                src,
                srcAmount,
                dest,
                destAddress,
                2**255,
                rate,
                platformWallet,
                platformFeeBps,
                hint
            );
    }
}
