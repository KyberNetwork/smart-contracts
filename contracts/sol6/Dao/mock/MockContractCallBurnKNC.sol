pragma solidity 0.6.6;

import "../nimbleFeeHandler.sol";


contract MockContractCallBurnNIM {
    nimbleFeeHandler public feeHandler;

    constructor(nimbleFeeHandler _feeHandler) public {
        feeHandler = _feeHandler;
    }

    function callBurnNIM() public {
        feeHandler.burnNIM();
    }
}
