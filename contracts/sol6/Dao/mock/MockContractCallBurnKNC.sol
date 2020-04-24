pragma solidity 0.6.6;

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
