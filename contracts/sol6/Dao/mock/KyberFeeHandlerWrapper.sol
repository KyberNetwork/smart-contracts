pragma solidity 0.6.6;

import "../../utils/Utils5.sol";
import "../../utils/zeppelin/ReentrancyGuard.sol";
import "../../utils/zeppelin/SafeERC20.sol";
import "../../utils/zeppelin/SafeMath.sol";
import "../../IKyberDao.sol";
import "../../IKyberFeeHandler.sol";
import "../DaoOperator.sol";

interface IFeeHandler is IKyberFeeHandler {
    function feePerPlatformWallet(address) external view returns (uint256);
    function rebatePerWallet(address) external view returns (uint256);
}


contract KyberFeeHandlerWrapper is DaoOperator {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    struct KyberFeeHandlerData {
        IFeeHandler kyberFeeHandler;
        uint256 startEpoch;
    }

    IKyberDao public immutable kyberDao;
    IERC20[] internal supportedTokens;
    mapping(IERC20 => KyberFeeHandlerData[]) internal kyberFeeHandlersPerToken;
    address public daoSetter;

    event FeeHandlerAdded(IERC20 token, IFeeHandler kyberFeeHandler);

    constructor(
        IKyberDao _kyberDao,
        address _daoOperator
    ) public DaoOperator(_daoOperator) {
        require(_kyberDao != IKyberDao(0), "kyberDao 0");
        kyberDao = _kyberDao;
    }

    function addFeeHandler(IERC20 _token, IFeeHandler _kyberFeeHandler) external onlyDaoOperator {
        addTokenToSupportedTokensArray(_token);
        addFeeHandlerToKyberFeeHandlerArray(kyberFeeHandlersPerToken[_token], _kyberFeeHandler);
        emit FeeHandlerAdded(_token, _kyberFeeHandler);
    }

    /// @dev claim from multiple feeHandlers
    /// @param staker staker address
    /// @param epoch epoch for which the staker is claiming the reward
    /// @param startTokenIndex index of supportedTokens to start iterating from (inclusive)
    /// @param endTokenIndex index of supportedTokens to end iterating to (exclusive)
    /// @param startKyberFeeHandlerIndex index of feeHandlerArray to start iterating from (inclusive)
    /// @param endKyberFeeHandlerIndex index of feeHandlerArray to end iterating to (exclusive)
    /// @return amounts staker reward wei / twei amount claimed from each feeHandler
    function claimStakerReward(
        address staker,
        uint256 epoch,
        uint256 startTokenIndex,
        uint256 endTokenIndex,
        uint256 startKyberFeeHandlerIndex,
        uint256 endKyberFeeHandlerIndex
    ) external returns(uint256[] memory amounts) {
        if (
            startTokenIndex > endTokenIndex ||
            startKyberFeeHandlerIndex > endKyberFeeHandlerIndex ||
            supportedTokens.length == 0
        ) {
            // no need to do anything
            return amounts;
        }

        uint256 endTokenId = (endTokenIndex >= supportedTokens.length) ?
            supportedTokens.length : endTokenIndex;

        for (uint256 i = startTokenIndex; i < endTokenId; i++) {
            KyberFeeHandlerData[] memory kyberFeeHandlerArray = kyberFeeHandlersPerToken[supportedTokens[i]];
            uint256 endKyberFeeHandlerId = (endKyberFeeHandlerIndex >= kyberFeeHandlerArray.length) ?
                kyberFeeHandlerArray.length - 1: endKyberFeeHandlerIndex - 1;
            require(endKyberFeeHandlerId >= startKyberFeeHandlerIndex, "bad array indices");
            amounts = new uint256[](endKyberFeeHandlerId - startKyberFeeHandlerIndex + 1);

            // iteration starts from endIndex, differs from claiming reserve rebates and platform wallets
            for (uint256 j = endKyberFeeHandlerId; j >= startKyberFeeHandlerIndex; j--) {
                KyberFeeHandlerData memory kyberFeeHandlerData = kyberFeeHandlerArray[j];
                if (kyberFeeHandlerData.startEpoch < epoch) {
                    amounts[j] = kyberFeeHandlerData.kyberFeeHandler.claimStakerReward(staker, epoch);
                    break;
                } else if (kyberFeeHandlerData.startEpoch == epoch) {
                    amounts[j] = kyberFeeHandlerData.kyberFeeHandler.claimStakerReward(staker, epoch);
                }

                if (j == 0) {
                    break;
                }
            }
        }
    }

    /// @dev claim reabate per reserve wallet. called by any address
    /// @param rebateWallet the wallet to claim rebates for. Total accumulated rebate sent to this wallet
    /// @param startTokenIndex index of supportedTokens to start iterating from (inclusive)
    /// @param endTokenIndex index of supportedTokens to end iterating to (exclusive)
    /// @param startKyberFeeHandlerIndex index of feeHandlerArray to start iterating from (inclusive)
    /// @param endKyberFeeHandlerIndex index of feeHandlerArray to end iterating to (exclusive)
    /// @return amounts reserve rebate wei / twei amount claimed from each feeHandler
    function claimReserveRebate(
        address rebateWallet,
        uint256 startTokenIndex,
        uint256 endTokenIndex,
        uint256 startKyberFeeHandlerIndex,
        uint256 endKyberFeeHandlerIndex
    ) external returns (uint256[] memory amounts) 
    {
        if (
            startTokenIndex > endTokenIndex ||
            startKyberFeeHandlerIndex > endKyberFeeHandlerIndex ||
            supportedTokens.length == 0
        ) {
            // no need to do anything
            return amounts;
        }

        uint256 endTokenId = (endTokenIndex >= supportedTokens.length) ?
            supportedTokens.length : endTokenIndex;

        for (uint256 i = startTokenIndex; i < endTokenId; i++) {
            KyberFeeHandlerData[] memory kyberFeeHandlerArray = kyberFeeHandlersPerToken[supportedTokens[i]];
            uint256 endKyberFeeHandlerId = (endKyberFeeHandlerIndex >= kyberFeeHandlerArray.length) ?
                kyberFeeHandlerArray.length : endKyberFeeHandlerIndex;
            require(endKyberFeeHandlerId >= startKyberFeeHandlerIndex, "bad array indices");
            amounts = new uint256[](endKyberFeeHandlerId - startKyberFeeHandlerIndex + 1);
            
            for (uint256 j = startKyberFeeHandlerIndex; j < endKyberFeeHandlerId; j++) {
                IFeeHandler feeHandler = kyberFeeHandlerArray[j].kyberFeeHandler;
                if (feeHandler.rebatePerWallet(rebateWallet) > 1) {
                    amounts[j] = feeHandler.claimReserveRebate(rebateWallet);
                }
            }
        }
    }

    /// @dev claim accumulated fee per platform wallet. Called by any address
    /// @param platformWallet the wallet to claim fee for. Total accumulated fee sent to this wallet
    /// @param startTokenIndex index of supportedTokens to start iterating from (inclusive)
    /// @param endTokenIndex index of supportedTokens to end iterating to (exclusive)
    /// @param startKyberFeeHandlerIndex index of feeHandlerArray to start iterating from (inclusive)
    /// @param endKyberFeeHandlerIndex index of feeHandlerArray to end iterating to (exclusive)
    /// @return amounts platform fee wei / twei amount claimed from each feeHandler
    function claimPlatformFee(
        address platformWallet,
        uint256 startTokenIndex,
        uint256 endTokenIndex,
        uint256 startKyberFeeHandlerIndex,
        uint256 endKyberFeeHandlerIndex
    ) external returns (uint256[] memory amounts)
    {
        if (
            startTokenIndex > endTokenIndex ||
            startKyberFeeHandlerIndex > endKyberFeeHandlerIndex ||
            supportedTokens.length == 0
        ) {
            // no need to do anything
            return amounts;
        }

        uint256 endTokenId = (endTokenIndex >= supportedTokens.length) ?
            supportedTokens.length : endTokenIndex;

        for (uint256 i = startTokenIndex; i < endTokenId; i++) {
            KyberFeeHandlerData[] memory kyberFeeHandlerArray = kyberFeeHandlersPerToken[supportedTokens[i]];
            uint256 endKyberFeeHandlerId = (endKyberFeeHandlerIndex >= kyberFeeHandlerArray.length) ?
                kyberFeeHandlerArray.length : endKyberFeeHandlerIndex;
            require(endKyberFeeHandlerId >= startKyberFeeHandlerIndex, "bad array indices");
            amounts = new uint256[](endKyberFeeHandlerId - startKyberFeeHandlerIndex + 1);

            for (uint256 j = startKyberFeeHandlerIndex; j < endKyberFeeHandlerId; j++) {
                IFeeHandler feeHandler = kyberFeeHandlerArray[j].kyberFeeHandler;
                if (feeHandler.feePerPlatformWallet(platformWallet) > 1) {
                    amounts[j] = feeHandler.claimPlatformFee(platformWallet);
                }
            }
        }
    }

    function getKyberFeeHandlersPerToken(IERC20 token) external view returns (
        IFeeHandler[] memory kyberFeeHandlers,
        uint256[] memory epochs
        )
    {
        KyberFeeHandlerData[] storage kyberFeeHandlerData = kyberFeeHandlersPerToken[token];
        kyberFeeHandlers = new IFeeHandler[](kyberFeeHandlerData.length);
        epochs = new uint256[](kyberFeeHandlerData.length);
        for (uint i = 0; i < kyberFeeHandlerData.length; i++) {
            kyberFeeHandlers[i] = kyberFeeHandlerData[i].kyberFeeHandler;
            epochs[i] = kyberFeeHandlerData[i].startEpoch;
        }
    }
    
    function getSupportedTokens() external view returns (IERC20[] memory) {
        return supportedTokens;
    }

    function addTokenToSupportedTokensArray(IERC20 _token) internal {
        uint256 i;
        for (i = 0; i < supportedTokens.length; i++) {
            if (_token == supportedTokens[i]) {
                // already added, return
                return;
            }
        }
        supportedTokens.push(_token);
    }

    function addFeeHandlerToKyberFeeHandlerArray(
        KyberFeeHandlerData[] storage kyberFeeHandlerArray,
        IFeeHandler _kyberFeeHandler
    ) internal {
        uint256 i;
        for (i = 0; i < kyberFeeHandlerArray.length; i++) {
            if (_kyberFeeHandler == kyberFeeHandlerArray[i].kyberFeeHandler) {
                // already added, return
                return;
            }
        }
        kyberFeeHandlerArray.push(KyberFeeHandlerData({
            kyberFeeHandler: _kyberFeeHandler,
            startEpoch: kyberDao.getCurrentEpochNumber()
            })
        );
    }
}
