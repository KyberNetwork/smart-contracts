pragma solidity 0.5.11;

import "./IKyberStorage.sol";
import "./IKyberDAO.sol";
import "./IKyberFeeHandler.sol";
import "./IKyberMatchingEngine.sol";
import "./IKyberNetwork.sol";
import "./IKyberNetworkProxy.sol";
import "./utils/PermissionGroups2.sol";


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
    IKyberNetworkProxy[] internal kyberProxyArray;
    mapping(address => bool) internal kyberProxyContracts;

    mapping(bytes8 => address[]) public reserveIdToAddresses;
    mapping(address => bytes8) internal reserveAddressToId;

    IKyberNetwork public network;

    event KyberProxyAdded(address proxy);
    event KyberProxyRemoved(address proxy);

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

    function addReserve(address reserve, bytes8 reserveId)
        external
        onlyNetwork
        returns (bool)
    {
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
        require(
            reserveAddressToId[reserve] != bytes8(0),
            "reserve -> 0 reserveId"
        );
        bytes8 reserveId = reserveAddressToId[reserve];

        reserveIdToAddresses[reserveId].push(
            reserveIdToAddresses[reserveId][0]
        );
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
        returns (address[] reserveAddresses)
    {
        reserveAddresses = new bytes8[](reserveIds.length);
        for (uint256 i = 0; i < reserveIds.length; i++) {
            reserveAddresses[i] = reserveIdToAddresses[reserveIds[i]][0];
        }
    }

    /// @dev no. of KyberNetworkProxies are capped
    function addKyberProxy(address networkProxy, uint256 max_approved_proxies)
        external
        onlyNetwork
        returns (bool)
    {
        require(networkProxy != address(0), "proxy 0");
        require(!kyberProxyContracts[networkProxy], "proxy exists");
        require(kyberProxyArray.length < max_approved_proxies, "Max 2 proxy");

        kyberProxyArray.push(IKyberNetworkProxy(networkProxy));

        kyberProxyContracts[networkProxy] = true;
        return true;
    }

    function removeKyberProxy(address networkProxy)
        external
        onlyNetwork
        returns (bool)
    {
        require(kyberProxyContracts[networkProxy], "proxy not found");

        uint256 proxyIndex = 2**255;

        for (uint256 i = 0; i < kyberProxyArray.length; i++) {
            if (kyberProxyArray[i] == IKyberNetworkProxy(networkProxy)) {
                proxyIndex = i;
                break;
            }
        }

        kyberProxyArray[proxyIndex] = kyberProxyArray[kyberProxyArray.length -
            1];
        kyberProxyArray.pop();

        kyberProxyContracts[networkProxy] = false;
        return true;
    }

    /// @notice should be called off chain
    /// @dev get an array of KyberNetworkProxies
    /// @return An array of both KyberNetworkProxies
    function getKyberProxies()
        external
        view
        returns (IKyberNetworkProxy[] memory)
    {
        return kyberProxyArray;
    }

    function isKyberProxyAdded() external view returns (bool) {
        return (kyberProxyArray.length > 0);
    }

    function isValidProxyContract(address c) external view returns (bool) {
        return kyberProxyContracts[c];
    }
}
