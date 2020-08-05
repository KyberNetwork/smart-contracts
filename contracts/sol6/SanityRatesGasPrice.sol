pragma solidity 0.6.6;

import "./utils/Utils5.sol";
import "./utils/Withdrawable3.sol";

contract SanityRatesGasPrice is Withdrawable3, Utils5 {
    struct SanityData {
        uint224 tokenRate;
        uint32 reasonableDiffInBps;
    }

    mapping(address => SanityData) public sanityData;
    uint256 public maxGasPriceWei = 50 * 1000 * 1000 * 1000; // 50 gwei

    event SanityMaxGasPriceSet(uint256 maxGasPrice);

    constructor(address _admin) public Withdrawable3(_admin) {
        require(_admin != address(0), "admin 0");
        admin = _admin;
    }

    /// @dev set reasonableDiffInBps of a token to MAX_RATE if you want to ignore
    ///      sanity rate for it, and return the token's normal rate
    function setReasonableDiff(IERC20[] memory srcs, uint256[] memory diff) public onlyAdmin {
        require(srcs.length == diff.length, "srcs,diff length mismatch");
        for (uint256 i = 0; i < srcs.length; i++) {
            require(
                diff[i] <= 100 * 100 || diff[i] == MAX_RATE,
                "Diff must be <= 10000 BPS or == MAX_RATE"
            );
            sanityData[address(srcs[i])].reasonableDiffInBps = uint32(diff[i]);
        }
    }

    function setMaxGasPriceWei(uint256 _maxGasPriceWei) public onlyOperator {
        require(_maxGasPriceWei > 0, "maxGasPriceWei must be > 0");
        maxGasPriceWei = _maxGasPriceWei;
        emit SanityMaxGasPriceSet(maxGasPriceWei);
    }

    function setSanityRates(IERC20[] memory srcs, uint256[] memory rates) public onlyOperator {
        require(srcs.length == rates.length, "srcs,rates length mismatch");

        for (uint256 i = 0; i < srcs.length; i++) {
            require(rates[i] > 0 && rates[i] <= MAX_RATE, "rate must be > 0 and <= MAX_RATE");
            sanityData[address(srcs[i])].tokenRate = uint224(rates[i]);
        }
    }

    function getSanityRate(IERC20 src, IERC20 dest) public view returns (uint256) {
        SanityData memory data;

        if (src != ETH_TOKEN_ADDRESS && dest != ETH_TOKEN_ADDRESS) return 0;
        if (tx.gasprice > maxGasPriceWei) return 0;

        uint256 rate;
        uint32 reasonableDiffInBps;
        if (src == ETH_TOKEN_ADDRESS) {
            data = sanityData[address(dest)];
            reasonableDiffInBps = data.reasonableDiffInBps;
            rate = data.tokenRate > 0 ? (PRECISION * PRECISION) / data.tokenRate : 0;
        } else {
            data = sanityData[address(src)];
            reasonableDiffInBps = data.reasonableDiffInBps;
            rate = data.tokenRate;
        }

        if (reasonableDiffInBps == MAX_RATE) return MAX_RATE;

        return (rate * (10000 + data.reasonableDiffInBps)) / 10000;
    }
}
