pragma solidity 0.6.6;

import "../../utils/Utils5.sol";
import "../../utils/zeppelin/ReentrancyGuard.sol";
import "../../utils/zeppelin/SafeERC20.sol";
import "../../utils/zeppelin/SafeMath.sol";
import "../../InimbleDao.sol";
import "../../InimbleFeeHandler.sol";
import "../DaoOperator.sol";

interface IFeeHandler is InimbleFeeHandler {
    function feePerPlatformWallet(address) external view returns (uint256);
    function rebatePerWallet(address) external view returns (uint256);
}


contract nimbleFeeHandlerWrapper is DaoOperator {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    struct nimbleFeeHandlerData {
        IFeeHandler nimbleFeeHandler;
        uint256 startEpoch;
    }

    InimbleDao public immutable nimbleDao;
    IERC20[] internal supportedTokens;
    mapping(IERC20 => nimbleFeeHandlerData[]) internal nimbleFeeHandlersPerToken;
    address public daoSetter;

    event FeeHandlerAdded(IERC20 token, IFeeHandler nimbleFeeHandler);

    constructor(
        InimbleDao _nimbleDao,
        address _daoOperator
    ) public DaoOperator(_daoOperator) {
        require(_nimbleDao != InimbleDao(0), "nimbleDao 0");
        nimbleDao = _nimbleDao;
    }

    function addFeeHandler(IERC20 _token, IFeeHandler _nimbleFeeHandler) external onlyDaoOperator {
        addTokenToSupportedTokensArray(_token);
        addFeeHandlerTonimbleFeeHandlerArray(nimbleFeeHandlersPerToken[_token], _nimbleFeeHandler);
        emit FeeHandlerAdded(_token, _nimbleFeeHandler);
    }

    /// @dev claim from multiple feeHandlers
    /// @param staker staker address
    /// @param epoch epoch for which the staker is claiming the reward
    /// @param startTokenIndex index of supportedTokens to start iterating from (inclusive)
    /// @param endTokenIndex index of supportedTokens to end iterating to (exclusive)
    /// @param startnimbleFeeHandlerIndex index of feeHandlerArray to start iterating from (inclusive)
    /// @param endnimbleFeeHandlerIndex index of feeHandlerArray to end iterating to (exclusive)
    /// @return amounts staker reward wei / twei amount claimed from each feeHandler
    function claimStakerReward(
        address staker,
        uint256 epoch,
        uint256 startTokenIndex,
        uint256 endTokenIndex,
        uint256 startnimbleFeeHandlerIndex,
        uint256 endnimbleFeeHandlerIndex
    ) external returns(uint256[] memory amounts) {
        if (
            startTokenIndex > endTokenIndex ||
            startnimbleFeeHandlerIndex > endnimbleFeeHandlerIndex ||
            supportedTokens.length == 0
        ) {
            // no need to do anything
            return amounts;
        }

        uint256 endTokenId = (endTokenIndex >= supportedTokens.length) ?
            supportedTokens.length : endTokenIndex;

        for (uint256 i = startTokenIndex; i < endTokenId; i++) {
            nimbleFeeHandlerData[] memory nimbleFeeHandlerArray = nimbleFeeHandlersPerToken[supportedTokens[i]];
            uint256 endnimbleFeeHandlerId = (endnimbleFeeHandlerIndex >= nimbleFeeHandlerArray.length) ?
                nimbleFeeHandlerArray.length - 1: endnimbleFeeHandlerIndex - 1;
            require(endnimbleFeeHandlerId >= startnimbleFeeHandlerIndex, "bad array indices");
            amounts = new uint256[](endnimbleFeeHandlerId - startnimbleFeeHandlerIndex + 1);

            // iteration starts from endIndex, differs from claiming reserve rebates and platform wallets
            for (uint256 j = endnimbleFeeHandlerId; j >= startnimbleFeeHandlerIndex; j--) {
                nimbleFeeHandlerData memory nimbleFeeHandlerData = nimbleFeeHandlerArray[j];
                if (nimbleFeeHandlerData.startEpoch < epoch) {
                    amounts[j] = nimbleFeeHandlerData.nimbleFeeHandler.claimStakerReward(staker, epoch);
                    break;
                } else if (nimbleFeeHandlerData.startEpoch == epoch) {
                    amounts[j] = nimbleFeeHandlerData.nimbleFeeHandler.claimStakerReward(staker, epoch);
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
    /// @param startnimbleFeeHandlerIndex index of feeHandlerArray to start iterating from (inclusive)
    /// @param endnimbleFeeHandlerIndex index of feeHandlerArray to end iterating to (exclusive)
    /// @return amounts reserve rebate wei / twei amount claimed from each feeHandler
    function claimReserveRebate(
        address rebateWallet,
        uint256 startTokenIndex,
        uint256 endTokenIndex,
        uint256 startnimbleFeeHandlerIndex,
        uint256 endnimbleFeeHandlerIndex
    ) external returns (uint256[] memory amounts) 
    {
        if (
            startTokenIndex > endTokenIndex ||
            startnimbleFeeHandlerIndex > endnimbleFeeHandlerIndex ||
            supportedTokens.length == 0
        ) {
            // no need to do anything
            return amounts;
        }

        uint256 endTokenId = (endTokenIndex >= supportedTokens.length) ?
            supportedTokens.length : endTokenIndex;

        for (uint256 i = startTokenIndex; i < endTokenId; i++) {
            nimbleFeeHandlerData[] memory nimbleFeeHandlerArray = nimbleFeeHandlersPerToken[supportedTokens[i]];
            uint256 endnimbleFeeHandlerId = (endnimbleFeeHandlerIndex >= nimbleFeeHandlerArray.length) ?
                nimbleFeeHandlerArray.length : endnimbleFeeHandlerIndex;
            require(endnimbleFeeHandlerId >= startnimbleFeeHandlerIndex, "bad array indices");
            amounts = new uint256[](endnimbleFeeHandlerId - startnimbleFeeHandlerIndex + 1);
            
            for (uint256 j = startnimbleFeeHandlerIndex; j < endnimbleFeeHandlerId; j++) {
                IFeeHandler feeHandler = nimbleFeeHandlerArray[j].nimbleFeeHandler;
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
    /// @param startnimbleFeeHandlerIndex index of feeHandlerArray to start iterating from (inclusive)
    /// @param endnimbleFeeHandlerIndex index of feeHandlerArray to end iterating to (exclusive)
    /// @return amounts platform fee wei / twei amount claimed from each feeHandler
    function claimPlatformFee(
        address platformWallet,
        uint256 startTokenIndex,
        uint256 endTokenIndex,
        uint256 startnimbleFeeHandlerIndex,
        uint256 endnimbleFeeHandlerIndex
    ) external returns (uint256[] memory amounts)
    {
        if (
            startTokenIndex > endTokenIndex ||
            startnimbleFeeHandlerIndex > endnimbleFeeHandlerIndex ||
            supportedTokens.length == 0
        ) {
            // no need to do anything
            return amounts;
        }

        uint256 endTokenId = (endTokenIndex >= supportedTokens.length) ?
            supportedTokens.length : endTokenIndex;

        for (uint256 i = startTokenIndex; i < endTokenId; i++) {
            nimbleFeeHandlerData[] memory nimbleFeeHandlerArray = nimbleFeeHandlersPerToken[supportedTokens[i]];
            uint256 endnimbleFeeHandlerId = (endnimbleFeeHandlerIndex >= nimbleFeeHandlerArray.length) ?
                nimbleFeeHandlerArray.length : endnimbleFeeHandlerIndex;
            require(endnimbleFeeHandlerId >= startnimbleFeeHandlerIndex, "bad array indices");
            amounts = new uint256[](endnimbleFeeHandlerId - startnimbleFeeHandlerIndex + 1);

            for (uint256 j = startnimbleFeeHandlerIndex; j < endnimbleFeeHandlerId; j++) {
                IFeeHandler feeHandler = nimbleFeeHandlerArray[j].nimbleFeeHandler;
                if (feeHandler.feePerPlatformWallet(platformWallet) > 1) {
                    amounts[j] = feeHandler.claimPlatformFee(platformWallet);
                }
            }
        }
    }

    function getnimbleFeeHandlersPerToken(IERC20 token) external view returns (
        IFeeHandler[] memory nimbleFeeHandlers,
        uint256[] memory epochs
        )
    {
        nimbleFeeHandlerData[] storage nimbleFeeHandlerData = nimbleFeeHandlersPerToken[token];
        nimbleFeeHandlers = new IFeeHandler[](nimbleFeeHandlerData.length);
        epochs = new uint256[](nimbleFeeHandlerData.length);
        for (uint i = 0; i < nimbleFeeHandlerData.length; i++) {
            nimbleFeeHandlers[i] = nimbleFeeHandlerData[i].nimbleFeeHandler;
            epochs[i] = nimbleFeeHandlerData[i].startEpoch;
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

    function addFeeHandlerTonimbleFeeHandlerArray(
        nimbleFeeHandlerData[] storage nimbleFeeHandlerArray,
        IFeeHandler _nimbleFeeHandler
    ) internal {
        uint256 i;
        for (i = 0; i < nimbleFeeHandlerArray.length; i++) {
            if (_nimbleFeeHandler == nimbleFeeHandlerArray[i].nimbleFeeHandler) {
                // already added, return
                return;
            }
        }
        nimbleFeeHandlerArray.push(nimbleFeeHandlerData({
            nimbleFeeHandler: _nimbleFeeHandler,
            startEpoch: nimbleDao.getCurrentEpochNumber()
            })
        );
    }
}
