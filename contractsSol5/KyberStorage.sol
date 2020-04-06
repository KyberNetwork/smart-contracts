pragma solidity 0.5.11;

import "./IKyberStorage.sol";
import "./IKyberFeeHandler.sol";
import "./IKyberMatchingEngine.sol";
import "./IKyberNetwork.sol";
import "./utils/PermissionGroups2.sol";


/**
 *   @title KyberStorage contract
 *   Receives call from KyberNetwork for:
 *   - record contract changes for matchingEngine, feeHandler, reserves and kyberDAO
 */
contract KyberStorage is IKyberStorage, PermissionGroups2 {
    // store current and previous contracts.
    IKyberNetwork[] internal oldNetworks;
    IKyberFeeHandler[] internal feeHandler;
    IKyberDAO[] internal kyberDAO;
    IKyberMatchingEngine[] internal matchingEngine;
    IKyberReserve[] internal reserves;
    IKyberNetworkProxy[] internal kyberProxyArray;

    mapping(bytes32 => address[]) internal reserveIdToAddresses;
    mapping(address => bytes32)   internal reserveAddressToId;
    mapping(address=>bytes32[])   internal reservesPerTokenSrc;   // reserves supporting token to eth
    mapping(address=>bytes32[])   internal reservesPerTokenDest;  // reserves support eth to token

    IKyberNetwork public network;

    modifier onlyNetwork() {
        require(msg.sender == address(network), "Only network");
        _;
    }

    constructor(address _admin) public PermissionGroups2(_admin) {}

    event KyberNetworkUpdated(IKyberNetwork network);
    function setNetworkContract(IKyberNetwork _network) external onlyAdmin {
        require(_network != IKyberNetwork(0), "network 0");
        oldNetworks.push(network);
        network = _network;
        emit KyberNetworkUpdated(_network);
    }

    function setContracts(
        IKyberFeeHandler _feeHandler,
        address _matchingEngine
    ) external onlyNetwork returns (bool) {
        IKyberMatchingEngine newMatchingEngine = IKyberMatchingEngine(_matchingEngine);

        if (feeHandler.length > 0) {
            feeHandler.push(feeHandler[0]);
            feeHandler[0] = _feeHandler;
        } else {
            feeHandler.push(_feeHandler);
        }

        if (matchingEngine.length > 0) {
            matchingEngine.push(matchingEngine[0]);
            matchingEngine[0] = newMatchingEngine;
        } else {
            matchingEngine.push(newMatchingEngine);
        }
        return true;
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
        return true;
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

    function addReserve(address reserve, bytes32 reserveId)
        external
        onlyNetwork
        returns (bool)
    {
        reserves.push(IKyberReserve(reserve));
        require(reserveAddressToId[reserve] == bytes32(0), "reserve has id");
        require(reserveId != 0, "reserveId = 0");
        if (reserveIdToAddresses[reserveId].length == 0) {
            reserveIdToAddresses[reserveId].push(reserve);
        } else {
            require(reserveIdToAddresses[reserveId][0] == address(0), "reserveId taken");
            reserveIdToAddresses[reserveId][0] = reserve;
        }
        
        reserves.push(IKyberReserve(reserve));
        reserveAddressToId[reserve] = reserveId;
        
        return true;
    }

    function removeReserve(address reserve, uint startIndex)
        external
        onlyNetwork
        returns (bytes32 reserveId)
    {
        uint reserveIndex = 2**255;
        for (uint i = startIndex; i < reserves.length; i++) {
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
            reserveAddressToId[reserve] != bytes32(0),
            "reserve -> 0 reserveId"
        );
        reserveId = reserveAddressToId[reserve];

        //update reserve mappings
        reserveIdToAddresses[reserveId].push(reserveIdToAddresses[reserveId][0]);
        reserveIdToAddresses[reserveId][0] = address(0);
        reserveAddressToId[reserve] = bytes32(0);

        return reserveId;
    }

    function listPairForReserve(address reserve, IERC20 token, bool ethToToken, bool tokenToEth, bool add)
        external onlyNetwork returns (bool)
    {
        bytes32 reserveId = reserveAddressToId[reserve];
        require(reserveId != bytes32(0), "reserveId = 0");

        if (ethToToken) {
            listPairs(reserveId, token, false, add);
        }

        if (tokenToEth) {
            listPairs(reserveId, token, true, add);
        }

        return true;   
    }

    function listPairs(bytes32 reserveId, IERC20 token, bool isTokenToEth, bool add) internal {
        uint i;
        bytes32[] storage reserveArr = reservesPerTokenDest[address(token)];

        if (isTokenToEth) {
            reserveArr = reservesPerTokenSrc[address(token)];
        }

        for (i = 0; i < reserveArr.length; i++) {
            if (reserveId == reserveArr[i]) {
                if (add) {
                    break; //already added
                } else {
                    //remove
                    reserveArr[i] = reserveArr[reserveArr.length - 1];
                    reserveArr.pop();
                    break;
                }
            }
        }

        if (add && i == reserveArr.length) {
            //if reserve wasn't found add it
            reserveArr.push(reserveId);
        }
    }

    /// @notice should be called off chain
    /// @dev get an array of all reserves
    /// @return An array of all reserves
    function getReserves() external view returns (IKyberReserve[] memory) {
        return reserves;
    }

    function convertReserveAddresstoId(address reserve) external view returns (bytes32 reserveId) {
        return reserveAddressToId[reserve];
    }

    function convertReserveIdToAddress(bytes32 reserveId) external view returns (address reserve) {
        return reserveIdToAddresses[reserveId][0];
    }

    function convertReserveAddressestoIds(address[] calldata reserveAddresses)
        external
        view
        returns (bytes32[] memory reserveIds) {
        reserveIds = new bytes32[](reserveAddresses.length);
        for (uint i = 0; i < reserveAddresses.length; i++) {
            reserveIds[i] = reserveAddressToId[reserveAddresses[i]];
        }
    }

    function convertReserveIdsToAddresses(bytes32[] calldata reserveIds)
        external
        view
        returns (address[] memory reserveAddresses)
    {
        reserveAddresses = new address[](reserveIds.length);
        for (uint i = 0; i < reserveIds.length; i++) {
            reserveAddresses[i] = reserveIdToAddresses[reserveIds[i]][0];
        }
    }

    function getReservesPerTokenSrc(address token) external view returns (bytes32[] memory reserveIds) {
        return reservesPerTokenSrc[token];
    }

    function getReservesPerTokenDest(address token) external view returns (bytes32[] memory reserveIds) {
        return reservesPerTokenDest[token];
    }

    /// @dev no. of KyberNetworkProxies are capped
    function addKyberProxy(address networkProxy, uint max_approved_proxies)
        external
        onlyNetwork
        returns (bool)
    {
        require(kyberProxyArray.length < max_approved_proxies, "Max 2 proxy");

        kyberProxyArray.push(IKyberNetworkProxy(networkProxy));

        return true;
    }

    function removeKyberProxy(address networkProxy)
        external
        onlyNetwork
        returns (bool)
    {
        uint proxyIndex = 2**255;

        for (uint i = 0; i < kyberProxyArray.length; i++) {
            if (kyberProxyArray[i] == IKyberNetworkProxy(networkProxy)) {
                proxyIndex = i;
                break;
            }
        }

        kyberProxyArray[proxyIndex] = kyberProxyArray[kyberProxyArray.length -
            1];
        kyberProxyArray.pop();

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
}
