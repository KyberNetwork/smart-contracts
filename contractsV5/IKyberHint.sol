pragma solidity 0.5.11;

import "./IERC20.sol";
import "./IKyberReserve.sol";


interface IKyberHint {

    enum HintType {
        None,
        MaskIn,
        MaskOut,
        Split
    }

    function parseEthToTokenHint(bytes calldata hint) external view
        returns(HintType hintType, IKyberReserve[] memory reserves, uint[] memory splits, uint failureHint);

    function parseTokenToEthHint(bytes calldata hint) external view
        returns(HintType hintType, IKyberReserve[] memory reserves, uint[] memory splits, uint failureHint);

    function parseTokenToTokenHint(bytes calldata hint) external view
        returns(HintType tokenToEthType, IKyberReserve[] memory tokenToEthReserves, uint[] memory tokenToEthSplits,
            HintType ethToTokenType, IKyberReserve[] memory ethToTokenReserves, uint[] memory ethToTokenSplits, uint failureHint);

    function buildEthToTokenHint(HintType hintType, address[] calldata reserves, uint[] calldata splits)
        external view returns(bytes memory hint);

    function buildTokenToEthHint(HintType hintType, address[] calldata reserves, uint[] calldata splits)
        external view returns(bytes memory hint);

    function buildTokenToTokenHint(HintType tokenToEthType, address[] calldata tokenToEthReserves, uint[] calldata tokenToEthSplits,
            HintType ethToTokenType, address[] calldata ethToTokenReserves, uint[] calldata ethToTokenSplits)
        external view returns(bytes memory hint);
}
