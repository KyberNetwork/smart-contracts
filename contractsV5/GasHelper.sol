pragma solidity 0.5.11;

import "./IGasHelper.sol";
import "./PermissionGroupsV5.sol";


interface IGST2 {
  function freeUpTo(uint256 value) external returns (uint256 freed);
  function freeFromUpTo(address from, uint256 value) external returns (uint256 freed);
  function balanceOf(address who) external view returns (uint256);
}


contract GasHelper is IGasHelper, PermissionGroups {
    
    IGST2 gst2 = IGST2(0x0000000000b3F879cb30FE243b4Dfee438691c04);
    // todo: for final version set a constant network address
    address kyberNetwork;

    constructor(address _kyberNetwork, address _admin) public PermissionGroups(_admin) {
        require(_kyberNetwork != address(0));
        kyberNetwork = _kyberNetwork;
    }

    function help(address platformWallet, IERC20 src, IERC20 dest) external {
        require(msg.sender == kyberNetwork);

        platformWallet;
        src;
        dest;
        
        freeGas(3);
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
			return gst2.freeUpTo(num_tokens);
		} else {
			return 0;
		}
	}
}
