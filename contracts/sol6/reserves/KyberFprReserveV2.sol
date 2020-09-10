// SPDX-License-Identifier: MIT
pragma solidity 0.6.6;

import "./IConversionRates.sol";
import "./IWeth.sol";
import "../IKyberSanity.sol";
import "../IKyberReserve.sol";
import "../IERC20.sol";
import "../utils/Utils5.sol";
import "../utils/Withdrawable3.sol";
import "../utils/zeppelin/SafeERC20.sol";

/// @title KyberFprReserve version 2
/// Allow Reserve to work work with either weth or eth.
/// for working with weth should specify external address to hold weth.
/// Allow Reserve to set maxGasPriceWei to trade with
contract KyberFprReserveV2 is IKyberReserve, Utils5, Withdrawable3 {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    mapping(bytes32 => bool) public approvedWithdrawAddresses; // sha3(token,address)=>bool
    mapping(address => address) public tokenWallet;

    struct ConfigData {
        bool tradeEnabled;
        bool doRateValidation; // whether to do rate validation in trade func
        uint128 maxGasPriceWei;
    }

    address public kyberNetwork;
    ConfigData internal configData;

    IConversionRates public conversionRatesContract;
    IKyberSanity public sanityRatesContract;
    IWeth public weth;

    event DepositToken(IERC20 indexed token, uint256 amount);
    event TradeExecute(
        address indexed origin,
        IERC20 indexed src,
        uint256 srcAmount,
        IERC20 indexed destToken,
        uint256 destAmount,
        address payable destAddress
    );
    event TradeEnabled(bool enable);
    event MaxGasPriceUpdated(uint128 newMaxGasPrice);
    event DoRateValidationUpdated(bool doRateValidation);
    event WithdrawAddressApproved(IERC20 indexed token, address indexed addr, bool approve);
    event NewTokenWallet(IERC20 indexed token, address indexed wallet);
    event WithdrawFunds(IERC20 indexed token, uint256 amount, address indexed destination);
    event SetKyberNetworkAddress(address indexed network);
    event SetConversionRateAddress(IConversionRates indexed rate);
    event SetWethAddress(IWeth indexed weth);
    event SetSanityRateAddress(IKyberSanity indexed sanity);

    constructor(
        address _kyberNetwork,
        IConversionRates _ratesContract,
        IWeth _weth,
        uint128 _maxGasPriceWei,
        bool _doRateValidation,
        address _admin
    ) public Withdrawable3(_admin) {
        require(_kyberNetwork != address(0), "kyberNetwork 0");
        require(_ratesContract != IConversionRates(0), "ratesContract 0");
        require(_weth != IWeth(0), "weth 0");
        kyberNetwork = _kyberNetwork;
        conversionRatesContract = _ratesContract;
        weth = _weth;
        configData = ConfigData({
            tradeEnabled: true,
            maxGasPriceWei: _maxGasPriceWei,
            doRateValidation: _doRateValidation
        });
    }

    receive() external payable {
        emit DepositToken(ETH_TOKEN_ADDRESS, msg.value);
    }

    function trade(
        IERC20 srcToken,
        uint256 srcAmount,
        IERC20 destToken,
        address payable destAddress,
        uint256 conversionRate,
        bool /* validate */
    ) external override payable returns (bool) {
        require(msg.sender == kyberNetwork, "wrong sender");
        ConfigData memory data = configData;
        require(data.tradeEnabled, "trade not enable");
        require(tx.gasprice <= uint256(data.maxGasPriceWei), "gas price too high");

        doTrade(
            srcToken,
            srcAmount,
            destToken,
            destAddress,
            conversionRate,
            data.doRateValidation
        );

        return true;
    }

    function enableTrade() external onlyAdmin {
        configData.tradeEnabled = true;
        emit TradeEnabled(true);
    }

    function disableTrade() external onlyAlerter {
        configData.tradeEnabled = false;
        emit TradeEnabled(false);
    }

    function setMaxGasPrice(uint128 newMaxGasPrice) external onlyOperator {
        configData.maxGasPriceWei = newMaxGasPrice;
        emit MaxGasPriceUpdated(newMaxGasPrice);
    }

    function setDoRateValidation(bool _doRateValidation) external onlyAdmin {
        configData.doRateValidation = _doRateValidation;
        emit DoRateValidationUpdated(_doRateValidation);
    }

    function approveWithdrawAddress(
        IERC20 token,
        address addr,
        bool approve
    ) external onlyAdmin {
        approvedWithdrawAddresses[keccak256(abi.encodePacked(address(token), addr))] = approve;
        setDecimals(token);
        emit WithdrawAddressApproved(token, addr, approve);
    }

    /// @dev allow set tokenWallet[token] back to 0x0 address
    /// @dev in case of using weth from external wallet, must call set token wallet for weth
    ///      tokenWallet for weth must be different from this reserve address
    function setTokenWallet(IERC20 token, address wallet) external onlyAdmin {
        tokenWallet[address(token)] = wallet;
        setDecimals(token);
        emit NewTokenWallet(token, wallet);
    }

    /// @dev withdraw amount of token to an approved destination
    ///      if reserve is using weth instead of eth, should call withdraw weth
    /// @param token token to withdraw
    /// @param amount amount to withdraw
    /// @param destination address to transfer fund to
    function withdraw(
        IERC20 token,
        uint256 amount,
        address destination
    ) external onlyOperator {
        require(
            approvedWithdrawAddresses[keccak256(abi.encodePacked(address(token), destination))],
            "destination is not approved"
        );

        if (token == ETH_TOKEN_ADDRESS) {
            (bool success, ) = destination.call{value: amount}("");
            require(success, "withdraw eth failed");
        } else {
            address wallet = getTokenWallet(token);
            if (wallet == address(this)) {
                token.safeTransfer(destination, amount);
            } else {
                token.safeTransferFrom(wallet, destination, amount);
            }
        }

        emit WithdrawFunds(token, amount, destination);
    }

    function setKyberNetwork(address _newNetwork) external onlyAdmin {
        require(_newNetwork != address(0), "kyberNetwork 0");
        kyberNetwork = _newNetwork;
        emit SetKyberNetworkAddress(_newNetwork);
    }

    function setConversionRate(IConversionRates _newConversionRate) external onlyAdmin {
        require(_newConversionRate != IConversionRates(0), "conversionRates 0");
        conversionRatesContract = _newConversionRate;
        emit SetConversionRateAddress(_newConversionRate);
    }

    /// @dev weth is unlikely to be changed, but added this function to keep the flexibilty
    function setWeth(IWeth _newWeth) external onlyAdmin {
        require(_newWeth != IWeth(0), "weth 0");
        weth = _newWeth;
        emit SetWethAddress(_newWeth);
    }

    /// @dev sanity rate can be set to 0x0 address to disable sanity rate check
    function setSanityRate(IKyberSanity _newSanity) external onlyAdmin {
        sanityRatesContract = _newSanity;
        emit SetSanityRateAddress(_newSanity);
    }

    function getConversionRate(
        IERC20 src,
        IERC20 dest,
        uint256 srcQty,
        uint256 blockNumber
    ) external override view returns (uint256) {
        ConfigData memory data = configData;
        if (!data.tradeEnabled) return 0;
        if (tx.gasprice > uint256(data.maxGasPriceWei)) return 0;
        if (srcQty == 0) return 0;

        IERC20 token;
        bool isBuy;

        if (ETH_TOKEN_ADDRESS == src) {
            isBuy = true;
            token = dest;
        } else if (ETH_TOKEN_ADDRESS == dest) {
            isBuy = false;
            token = src;
        } else {
            return 0; // pair is not listed
        }

        uint256 rate;
        try conversionRatesContract.getRate(token, blockNumber, isBuy, srcQty) returns(uint256 r) {
            rate = r;
        } catch {
            return 0;
        }
        uint256 destQty = calcDestAmount(src, dest, srcQty, rate);

        if (getBalance(dest) < destQty) return 0;

        if (sanityRatesContract != IKyberSanity(0)) {
            uint256 sanityRate = sanityRatesContract.getSanityRate(src, dest);
            if (rate > sanityRate) return 0;
        }

        return rate;
    }

    function isAddressApprovedForWithdrawal(IERC20 token, address addr)
        external
        view
        returns (bool)
    {
        return approvedWithdrawAddresses[keccak256(abi.encodePacked(address(token), addr))];
    }

    function tradeEnabled() external view returns (bool) {
        return configData.tradeEnabled;
    }

    function maxGasPriceWei() external view returns (uint128) {
        return configData.maxGasPriceWei;
    }

    function doRateValidation() external view returns (bool) {
        return configData.doRateValidation;
    }

    /// @dev return available balance of a token that reserve can use
    ///      if using weth, call getBalance(eth) will return weth balance
    ///      if using wallet for token, will return min of balance and allowance
    /// @param token token to get available balance that reserve can use
    function getBalance(IERC20 token) public view returns (uint256) {
        address wallet = getTokenWallet(token);
        IERC20 usingToken;

        if (token == ETH_TOKEN_ADDRESS) {
            if (wallet == address(this)) {
                // reserve should be using eth instead of weth
                return address(this).balance;
            }
            // reserve is using weth instead of eth
            usingToken = weth;
        } else {
            if (wallet == address(this)) {
                // not set token wallet or reserve is the token wallet, no need to check allowance
                return token.balanceOf(address(this));
            }
            usingToken = token;
        }

        uint256 balanceOfWallet = usingToken.balanceOf(wallet);
        uint256 allowanceOfWallet = usingToken.allowance(wallet, address(this));

        return minOf(balanceOfWallet, allowanceOfWallet);
    }

    /// @dev return wallet that holds the token
    ///      if token is ETH, check tokenWallet of WETH instead
    ///      if wallet is 0x0, consider as this reserve address
    function getTokenWallet(IERC20 token) public view returns (address wallet) {
        wallet = (token == ETH_TOKEN_ADDRESS)
            ? tokenWallet[address(weth)]
            : tokenWallet[address(token)];
        if (wallet == address(0)) {
            wallet = address(this);
        }
    }

    /// @dev do a trade, re-validate the conversion rate, remove trust assumption with network
    /// @param srcToken Src token
    /// @param srcAmount Amount of src token
    /// @param destToken Destination token
    /// @param destAddress Destination address to send tokens to
    /// @param validateRate re-validate rate or not
    function doTrade(
        IERC20 srcToken,
        uint256 srcAmount,
        IERC20 destToken,
        address payable destAddress,
        uint256 conversionRate,
        bool validateRate
    ) internal {
        require(conversionRate > 0, "rate is 0");

        bool isBuy = srcToken == ETH_TOKEN_ADDRESS;
        if (isBuy) {
            require(msg.value == srcAmount, "wrong msg value");
        } else {
            require(msg.value == 0, "bad msg value");
        }

        if (validateRate) {
            uint256 rate = conversionRatesContract.getRate(
                isBuy ? destToken : srcToken,
                block.number,
                isBuy,
                srcAmount
            );
            // re-validate conversion rate
            require(rate >= conversionRate, "reserve rate lower then network requested rate");
            if (sanityRatesContract != IKyberSanity(0)) {
                // sanity rate check
                uint256 sanityRate = sanityRatesContract.getSanityRate(srcToken, destToken);
                require(rate <= sanityRate, "rate should not be greater than sanity rate" );
            }
        }

        uint256 destAmount = calcDestAmount(srcToken, destToken, srcAmount, conversionRate);
        require(destAmount > 0, "dest amount is 0");

        address srcTokenWallet = getTokenWallet(srcToken);
        address destTokenWallet = getTokenWallet(destToken);

        if (isBuy) {
            // add to imbalance
            conversionRatesContract.recordImbalance(
                destToken,
                int256(destAmount),
                0,
                block.number
            );
            // if reserve is using weth, convert eth to weth and transfer weth to its' tokenWallet
            if (srcTokenWallet != address(this)) {
                weth.deposit{value: msg.value}();
                IERC20(weth).safeTransfer(srcTokenWallet, msg.value);
            }
            // transfer dest token from tokenWallet to destAddress
            if (destTokenWallet == address(this)) {
                destToken.safeTransfer(destAddress, destAmount);
            } else {
                destToken.safeTransferFrom(destTokenWallet, destAddress, destAmount);
            }
        } else {
            // add to imbalance
            conversionRatesContract.recordImbalance(
                srcToken,
                -1 * int256(srcAmount),
                0,
                block.number
            );
            // collect src token from sender
            srcToken.safeTransferFrom(msg.sender, srcTokenWallet, srcAmount);
            // if reserve is using weth, reserve needs to collect weth from tokenWallet,
            // then convert it to eth
            if (destTokenWallet != address(this)) {
                IERC20(weth).safeTransferFrom(destTokenWallet, address(this), destAmount);
                weth.withdraw(destAmount);
            }
            // transfer eth to destAddress
            (bool success, ) = destAddress.call{value: destAmount}("");
            require(success, "transfer eth from reserve to destAddress failed");
        }

        emit TradeExecute(msg.sender, srcToken, srcAmount, destToken, destAmount, destAddress);
    }
}
