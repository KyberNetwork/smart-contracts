pragma solidity 0.5.11;

import "../IGasHelper.sol";
import "../utils/Withdrawable2.sol";


interface IGST2 {
  function freeUpTo(uint256 value) external returns (uint256 freed);
  function freeFromUpTo(address from, uint256 value) external returns (uint256 freed);
  function balanceOf(address who) external view returns (uint256);
}


contract GasHelper is IGasHelper, Withdrawable2 {

    IGST2 constant GST2 = IGST2(0x0000000000b3F879cb30FE243b4Dfee438691c04);
    uint constant MIN_ACTIVATE_PRICE = 8 * 1000 * 1000 * 1000; // 8 gwei

    // todo: consider constant network address
    address kyberNetwork;

    constructor(address _kyberNetwork, address _admin) public Withdrawable2(_admin) {
        require(_kyberNetwork != address(0));
        kyberNetwork = _kyberNetwork;
    }

    function freeGas(address platformWallet, IERC20 src, IERC20 dest, uint tradeWei,
        bytes8[] calldata t2eReserveIds, bytes8[] calldata e2tReserveIds)
        external
    {
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

    function freeGas(uint num_tokens) internal returns (uint freed) {

        uint safe_num_tokens = 0;
		uint gas = gasleft();

		if (gas >= 27710) {
			safe_num_tokens = (gas - 27710) / (1148 + 5722 + 150);
		}

		if (num_tokens > safe_num_tokens) {
			num_tokens = safe_num_tokens;
		}

		if (num_tokens > 0) {
			return GST2.freeUpTo(num_tokens);
		} else {
			return 0;
		}
	}
}
