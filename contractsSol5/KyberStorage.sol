pragma solidity 0.5.11;

import "./IKyberStorage.sol";
import "./IKyberDAO.sol";
import "./IKyberFeeHandler.sol";
import "./IKyberMatchingEngine.sol";
import "./IKyberNetwork.sol";


/**
 *   @title KyberStorage contract
 *   Receives call from KyberNetwork for:
 *   - record contract changes for matchingEngine, feeHandler, reserves and kyberDAO
 */
contract KyberStorage is IKyberStorage {
    // store current and previous contracts.
    IKyberFeeHandler[] internal feeHandler;
    IKyberDAO[] internal kyberDAO;
    IKyberMatchingEngine[] internal matchingEngine;
    IKyberReserve[] internal reserves;

    mapping(bytes8=>address[])      public reserveIdToAddresses;
    mapping(address=>bytes8)        internal reserveAddressToId;

    IKyberNetwork public network;

    modifier onlyNetwork() {
        require(msg.sender == address(network), "Only network");
        _;
    }

    constructor(IKyberNetwork _network) public {
        network = _network;
    }

    function setContracts(
        IKyberFeeHandler _feeHandler,
        IKyberMatchingEngine _matchingEngine
    ) external onlyNetwork returns (bool) {
        if (feeHandler.length > 0) {
            feeHandler.push(feeHandler[0]);
            feeHandler[0] = _feeHandler;
        } else {
            feeHandler.push(_feeHandler);
        }

        if (matchingEngine.length > 0) {
            matchingEngine.push(matchingEngine[0]);
            matchingEngine[0] = _matchingEngine;
        } else {
            matchingEngine.push(_matchingEngine);
        }
    }

    function setDAOContract(IKyberDAO _kyberDAO)
        external
        onlyNetwork
        returns (bool)
    {
        if (kyberDAO.length > 0) {
            kyberDAO.push(kyberDAO[0]);
            kyberDAO[0] = _kyberDAO;
        } else {
            kyberDAO.push(_kyberDAO);
        }
    }

    /// @notice should be called off chain
    /// @dev returns list of DAO, feeHandler and matchingEngine contracts used
    /// @dev index 0 is currently used contract address, indexes > 0 are older versions
    function getContracts()
        external
        view
        returns (
            IKyberDAO[] memory daoAddresses,
            IKyberFeeHandler[] memory feeHandlerAddresses,
            IKyberMatchingEngine[] memory matchingEngineAddresses
        )
    {
        return (kyberDAO, feeHandler, matchingEngine);
    }

    function addReserve(address reserve, bytes8 reserveId) external onlyNetwork returns (bool) {
        reserves.push(IKyberReserve(reserve));
        require(reserveAddressToId[reserve] == bytes8(0), "reserve has id");
        require(reserveId != 0, "reserveId = 0");
        reserveAddressToId[reserve] = reserveId;
        return true;
    }

    function removeReserve(address reserve, uint256 startIndex)
        external
        onlyNetwork
        returns (bool)
    {
        uint256 reserveIndex = 2**255;
        for (uint256 i = startIndex; i < reserves.length; i++) {
            if (reserves[i] == IKyberReserve(reserve)) {
                reserveIndex = i;
                break;
            }
        }
        require(reserveIndex != 2**255, "reserve ?");
        reserves[reserveIndex] = reserves[reserves.length - 1];
        reserves.pop();
        // remove reserve from mapping to address
        require(reserveAddressToId[reserve] != bytes8(0), "reserve -> 0 reserveId");
        bytes8 reserveId = reserveAddressToId[reserve];

        reserveIdToAddresses[reserveId].push(reserveIdToAddresses[reserveId][0]);
        reserveIdToAddresses[reserveId][0] = address(0);
        reserveAddressToId[reserve] = bytes8(0);
    }

    /// @notice should be called off chain
    /// @dev get an array of all reserves
    /// @return An array of all reserves
    function getReserves() external view returns (IKyberReserve[] memory) {
        return reserves;
    }

    function convertReserveIdToAddress(bytes8[] reserveIds)
        external
        view
        returns (address[] reserveAddresses) {
            reserveAddresses = new bytes8[](reserveIds.length);
            for (uint i = 0; i < reserveIds.length; i++) {
                reserveAddresses[i] = reserveIdToAddresses[reserveIds[i]][0];
            }
        }
}
