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

    function addReserve(address reserve) external onlyNetwork returns (bool) {
        reserves.push(IKyberReserve(reserve));
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
    }

    /// @notice should be called off chain
    /// @dev get an array of all reserves
    /// @return An array of all reserves
    function getReserves() external view returns (IKyberReserve[] memory) {
        return reserves;
    }
}
