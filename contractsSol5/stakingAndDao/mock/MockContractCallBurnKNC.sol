pragma solidity 0.5.11;

import "../KyberFeeHandler.sol";


contract MockContractCallBurnKnc {
    KyberFeeHandler public feeHandler;

    constructor(KyberFeeHandler _feeHandler) public {
        feeHandler = _feeHandler;
    }

    function callBurnKnc() public {
        feeHandler.burnKnc();
    }
}
