pragma solidity 0.5.11;

import "./IKyberFeeHandler.sol";
import "./IKyberMatchingEngine.sol";


contract IKyberStorage {

    function setContracts(IKyberFeeHandler _feeHandler, IKyberMatchingEngine _matchingEngine) external view
        returns(bool);

    function addKyberProxy(address networkProxy) external returns(bool);

    function removeKyberProxy(address networkProxy) external returns(bool);

    function addReserve(address reserve, bytes8 reserveId, IKyberMatchingEngine.ReserveType reserveType,
        address payable rebateWallet)
        external returns(bool);

    function removeReserve(address reserve, uint startIndex) external returns(bool);
}