pragma solidity 0.6.6;

import "../IKyberReserve.sol";
import "../SanityRatesGasPrice.sol";
import "../utils/Utils5.sol";
import "../utils/zeppelin/SafeERC20.sol";
import "@nomiclabs/buidler/console.sol";


contract MockReserveSanity is IKyberReserve, Utils5 {
    using SafeERC20 for IERC20;

    SanityRatesGasPrice public sanityRatesContract;
    mapping(address => uint256) public buyTokenRates;
    mapping(address => uint256) public sellTokenRates;

    function setContracts(
        SanityRatesGasPrice _sanityRates
    ) public {
        sanityRatesContract = _sanityRates;
    }

    function setRate(
        IERC20 token,
        uint256 buyRate,
        uint256 sellRate
    ) public {
        buyTokenRates[address(token)] = buyRate;
        sellTokenRates[address(token)] = sellRate;
    }

    function trade(
        IERC20 srcToken,
        uint256 srcAmount,
        IERC20 destToken,
        address payable destAddress,
        uint256 conversionRate,
        bool validate
    ) public payable override virtual returns (bool) { }

    function getConversionRate(
        IERC20 src,
        IERC20 dest,
        uint256 srcQty,
        uint256 /* blockNumber */
    ) public view override returns (uint256) {
        uint256 rate = (src == ETH_TOKEN_ADDRESS)
            ? buyTokenRates[address(dest)]
            : sellTokenRates[address(src)];

        if (srcQty > MAX_QTY || rate > MAX_RATE ) {
            return 0;
        }

        if (address(sanityRatesContract) != address(0)) {
            uint sanityRate = sanityRatesContract.getSanityRate(src, dest);
            if (rate > sanityRate) return 0;
        }
        
        return rate;
    }
}
