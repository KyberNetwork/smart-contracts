pragma solidity 0.5.11;

import "./IKyberStorage.sol";
import "./IKyberDAO.sol";
import "./IKyberFeeHandler.sol";
import "./IKyberMatchingEngine.sol";

contract KyberStorage is IKyberStorage {

    // store current and previous contracts.
    IKyberFeeHandler[]      internal feeHandler;
    IKyberDAO[]             internal kyberDAO;
    IKyberMatchingEngine[]  internal matchingEngine;
    
    address[] internal reserves;
}
