pragma solidity 0.6.6;

import "../NimbleFeeHandler.sol";


contract MockContractCallBurnKnc {
    NimbleFeeHandler public feeHandler;

    constructor(NimbleFeeHandler _feeHandler) public {
        feeHandler = _feeHandler;
    }

    function callBurnKnc() public {
        feeHandler.burnKnc();
    }
}
