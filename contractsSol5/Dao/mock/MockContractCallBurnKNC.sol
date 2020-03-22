pragma solidity 0.5.11;

import "../KyberFeeHandler.sol";


contract MockContractCallBurnKNC {

    KyberFeeHandler public feeHandler;

    constructor(KyberFeeHandler _feeHandler) public {
        feeHandler = _feeHandler;
    }

    function callBurnKNC() public {
        feeHandler.burnKNC();
    }
}
