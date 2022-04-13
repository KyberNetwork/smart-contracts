pragma solidity 0.6.6;

import "../utils/Utils5.sol";
import "../utils/zeppelin/SafeERC20.sol";
import "../INimbleNetworkProxy.sol";


contract SimpleNimbleProxy is INimbleNetworkProxy, Utils5 {
    using SafeERC20 for IERC20;

    mapping(bytes32 => uint256) public pairRate; //rate in precision units. i.e. if rate is 10**18 its same as 1:1

    uint256 networkFeeBps = 25;

    receive() external payable {}

    function swapEtherToToken(IERC20 token, uint256 minConversionRate)
        external
        payable
        returns (uint256)
    {
        return
            trade(
                ETH_TOKEN_ADDRESS,
                msg.value,
                token,
                msg.sender,
                MAX_QTY,
                minConversionRate,
                address(0)
            );
    }

    function tradeWithHint(
        ERC20 src,
        uint256 srcAmount,
        ERC20 dest,
        address payable destAddress,
        uint256 maxDestAmount,
        uint256 minConversionRate,
        address payable walletId,
        bytes calldata hint
    ) external payable override returns (uint256) {
        hint;
        return
            trade(
                src,
                srcAmount,
                dest,
                destAddress,
                maxDestAmount,
                minConversionRate,
                walletId
            );
    }

    // new APIs
    function getExpectedRateAfterFee(
        IERC20 src,
        IERC20 dest,
        uint256 srcQty,
        uint256 platformFeeBps,
        bytes calldata hint
    ) external view override returns (uint256 expectedRate) {
        srcQty;
        platformFeeBps;
        hint;
        expectedRate = pairRate[keccak256(abi.encodePacked(src, dest))];
        expectedRate = (expectedRate * (BPS - platformFeeBps)) / BPS;
    }

    function setPairRate(
        ERC20 src,
        ERC20 dest,
        uint256 rate
    ) public {
        pairRate[keccak256(abi.encodePacked(src, dest))] = rate;
    }

    // @dev trade function with same prototype as NimbleNetwork
    // will be used only to trade token to Ether,
    // will work only when set pair worked.
    function trade(
        IERC20 src,
        uint256 srcAmount,
        IERC20 dest,
        address payable destAddress,
        uint256 maxDestAmount,
        uint256 minConversionRate,
        address payable platformWallet
    ) public payable override returns (uint256) {
        return
            tradeWithHintAndFee(
                src,
                srcAmount,
                dest,
                destAddress,
                maxDestAmount,
                minConversionRate,
                platformWallet,
                0,
                ""
            );
    }

    function tradeWithHintAndFee(
        IERC20 src,
        uint256 srcAmount,
        IERC20 dest,
        address payable destAddress,
        uint256 maxDestAmount,
        uint256 minConversionRate,
        address payable platformWallet,
        uint256 platformFeeBps,
        bytes memory hint
    ) public payable override returns (uint256 destAmount) {
        uint256 networkFeeWei;
        uint256 platformFeeWei;

        if (src == ETH_TOKEN_ADDRESS) {
            require(srcAmount == msg.value);
            networkFeeWei = (srcAmount * networkFeeBps) / BPS;
            platformFeeWei = (srcAmount * platformFeeBps) / BPS;
            srcAmount = srcAmount - networkFeeWei - platformFeeWei;
        } else {
            require(msg.value == 0);
            src.safeTransferFrom(msg.sender, address(this), srcAmount);
        }

        uint256 rate = pairRate[keccak256(abi.encodePacked(src, dest))];

        platformWallet;
        hint;
        maxDestAmount;

        require(rate > 0);
        require(rate >= minConversionRate);

        destAmount = (srcAmount * rate) / PRECISION;

        if (dest == ETH_TOKEN_ADDRESS) {
            networkFeeWei = (destAmount * networkFeeBps) / BPS;
            platformFeeWei = (destAmount * platformFeeBps) / BPS;
            destAmount -= (networkFeeWei + platformFeeWei);
            destAddress.transfer(destAmount);
        } else {
            dest.safeTransfer(destAddress, destAmount);
        }

        return destAmount;
    }

    function getExpectedRate(
        ERC20 src,
        ERC20 dest,
        uint256 srcQty
    ) public view override returns (uint256 expectedRate, uint256 worstRate) {
        srcQty;
        expectedRate = pairRate[keccak256(abi.encodePacked(src, dest))];
        worstRate = (expectedRate * 97) / 100;
    }
}
