pragma solidity 0.6.6;

import "../IGasHelper.sol";
import "../utils/WithdrawableNoModifiers.sol";


interface IGST2 {
    function freeUpTo(uint256 value) external returns (uint256 freed);

    function freeFromUpTo(address from, uint256 value) external returns (uint256 freed);

    function balanceOf(address who) external view returns (uint256);
}


contract GasHelper is IGasHelper, WithdrawableNoModifiers {
    address public kyberNetwork;

    IGST2 public constant GST2 = IGST2(0x0000000000b3F879cb30FE243b4Dfee438691c04);
    uint256 public constant MIN_ACTIVATE_PRICE = 8 * 1000 * 1000 * 1000; // 8 gwei

    constructor(address _kyberNetwork, address _admin) public WithdrawableNoModifiers(_admin) {
        require(_kyberNetwork != address(0));
        kyberNetwork = _kyberNetwork;
    }

    function freeGas(
        address platformWallet,
        IERC20 src,
        IERC20 dest,
        uint256 tradeWei,
        bytes32[] calldata t2eReserveIds,
        bytes32[] calldata e2tReserveIds
    ) external override {
        require(msg.sender == kyberNetwork);
        if (tx.gasprice <= MIN_ACTIVATE_PRICE) return;

        platformWallet;
        src;
        dest;
        tradeWei;
        t2eReserveIds;
        e2tReserveIds;

        freeGas(gasleft() / 2);
    }

    function freeGas(uint256 numTokens) internal returns (uint256 freed) {
        uint256 safeNumTokens = 0;
        uint256 gas = gasleft();

        if (gas >= 27710) {
            safeNumTokens = (gas - 27710) / (1148 + 5722 + 150);
        }

        if (numTokens > safeNumTokens) {
            numTokens = safeNumTokens;
        }

        if (numTokens > 0) {
            return GST2.freeUpTo(numTokens);
        } else {
            return 0;
        }
    }
}
