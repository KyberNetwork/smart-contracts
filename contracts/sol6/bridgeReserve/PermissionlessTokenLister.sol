pragma solidity 0.6.6;

import "../IERC20.sol";
import "../utils/Withdrawable3.sol";
import "../utils/Utils5.sol";

interface IKyberStorage {
    function listPairForReserve(
        bytes32 reserveId,
        IERC20 token,
        bool ethToToken,
        bool tokenToEth,
        bool add
    ) external;
    function getReserveAddressesByReserveId(bytes32 reserveId)
        external
        view
        returns (address[] memory reserveAddresses);
}

interface IKyberBridgeReserve {
    function listToken(
        IERC20 token,
        bool addDefaultPaths,
        bool validate
    ) external;
    function delistToken(IERC20 token) external;

    function tokenListed(IERC20 token) external view returns(bool);
}

/// Permissionless token lister for a bridge reserve
/// Some fee tokens must be excluded, for example: DGX
/// Bridge reserves must be implemented functions in IKyberBridgeReserve
contract PermissionlessTokenLister is Withdrawable3, Utils5 {

    mapping(IERC20 => bool) public tokenListed;
    IKyberStorage public kyberStorage;
    mapping(IERC20 => bool) public excludedTokens;
    bytes32 public immutable bridgeReserveId;

    event UpdateKyberStorage(IKyberStorage indexed kyberStorage);
    event UpdateExcludedTokens(IERC20[] tokens, bool indexed isAdd);
    event TokensListed(IERC20[] tokens);
    event TokensDelisted(IERC20[] tokens);

    constructor(address _admin, IKyberStorage _storage, bytes32 _bridgeReserveId)
        public Withdrawable3(_admin)
    {
        require(_storage != IKyberStorage(0), "storage is 0");
        require(_bridgeReserveId != bytes32(0), "bridge reserveId is 0");
        kyberStorage = _storage;
        bridgeReserveId = _bridgeReserveId;
    }

    function updateKyberStorage(IKyberStorage _storage) external onlyAdmin {
        require(_storage != IKyberStorage(0), "storage is 0");
        if (kyberStorage != _storage) {
            kyberStorage = _storage;
            emit UpdateKyberStorage(_storage);
        }
    }

    /// @dev add or remove list of excluded tokens
    ///      which are tokens that can not be listed for bridge reserves
    function updateExcludedTokens(IERC20[] calldata tokens, bool isAdd) external onlyOperator {
        for(uint256 i = 0; i < tokens.length; i++) {
            require(tokens[i] != IERC20(0), "token is 0");
            excludedTokens[tokens[i]] = isAdd;
        }
        emit UpdateExcludedTokens(tokens, isAdd);
    }

    /// @dev anyone can call this function to list some tokens for the bridge reserve
    ///      reserve should have been listed in KyberStorage
    function listTokens(IERC20[] calldata tokens) external {
        bytes32 reserveId = bridgeReserveId;
        address[] memory addresses = kyberStorage.getReserveAddressesByReserveId(reserveId);
        require(addresses.length > 0, "reserveId not found");
        IKyberBridgeReserve reserve = IKyberBridgeReserve(addresses[0]);
        for(uint256 i = 0; i < tokens.length; i++) {
            require(tokens[i] != IERC20(0), "token is 0");
            require(!excludedTokens[tokens[i]], "token is excluded");
            kyberStorage.listPairForReserve(reserveId, tokens[i], true, true, true);
            if (!reserve.tokenListed(tokens[i])) {
                reserve.listToken(tokens[i], true, true);
            }
        }
        emit TokensListed(tokens);
    }

    /// @dev only operators can call this function to delist some tokens for the bridge reserve
    function delistTokens(IERC20[] calldata tokens) external onlyOperator {
        bytes32 reserveId = bridgeReserveId;
        address[] memory addresses = kyberStorage.getReserveAddressesByReserveId(reserveId);
        require(addresses.length > 0, "reserveId not found");
        IKyberBridgeReserve reserve = IKyberBridgeReserve(addresses[0]);
        for(uint256 i = 0; i < tokens.length; i++) {
            require(tokens[i] != IERC20(0), "token is 0");
            kyberStorage.listPairForReserve(reserveId, tokens[i], true, true, false);
            if (reserve.tokenListed(tokens[i])) {
                reserve.delistToken(tokens[i]);
            }
        }
        emit TokensDelisted(tokens);
    }
}
