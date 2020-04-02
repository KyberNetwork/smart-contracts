pragma solidity 0.5.11;

import "./IKyberReserve.sol";
import "./IKyberNetwork.sol";
import "./IKyberMatchingEngine.sol";

interface IKyberNetworkRateHelper {

    function addReserve(address reserve, bytes32 reserveId) external returns (bool);
    function removeReserve(address reserve, bytes32 reserveId) external returns (bool);
    function setMatchingEngineContract(IKyberMatchingEngine _newMatchingEngine) external;

    function calculateTradeData(
        IERC20 token,
        uint srcAmount,
        uint tokenDecimals,
        bool isTokenToEth,
        bool isTokenToToken,
        uint networkFeeValue,
        bytes calldata hint
    )
        external view
        returns (
            IKyberReserve[] memory reserveAddresses,
            uint[] memory rates,
            uint[] memory splitValuesBps,
            bool[] memory isFeeCounted,
            bytes32[] memory ids
        );
}