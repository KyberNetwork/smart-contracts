pragma solidity 0.5.11;

import "../DAOContract.sol";

contract MockDAOContract is DAOContract {

    constructor(
        uint _epochPeriod, uint _startBlock,
        address _staking, address _feeHandler, address _knc,
        uint _maxNumOptions, uint _minCampDuration,
        uint _defaultNetworkFee, uint _defaultBrrData,
        address _admin
    ) DAOContract(
        _epochPeriod, _startBlock,
        _staking, _feeHandler, _knc,
        _maxNumOptions, _minCampDuration,
        _defaultNetworkFee, _defaultBrrData, _admin
    ) public {}


}