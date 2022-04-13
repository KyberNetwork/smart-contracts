pragma solidity 0.6.6;

import "../INimbleNetworkProxy.sol";


contract MockTrader {
    IERC20 internal constant ETH_TOKEN_ADDRESS = IERC20(
        0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE
    );
    INimbleNetworkProxy public NimbleNetworkProxy;

    constructor(INimbleNetworkProxy _NimbleNetworkProxy) public {
        NimbleNetworkProxy = _NimbleNetworkProxy;
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
            require(src.approve(address(NimbleNetworkProxy), srcAmount));
        }

        uint256 rate = NimbleNetworkProxy.getExpectedRateAfterFee(
            src,
            dest,
            srcAmount,
            platformFeeBps,
            hint
        );

        return
            NimbleNetworkProxy.tradeWithHintAndFee{value: msg.value}(
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
