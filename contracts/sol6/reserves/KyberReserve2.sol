
pragma solidity 0.6.6;

import "./IConversionRates.sol";
import "./IWeth.sol";
import "./ISanityRates.sol";
import "../IKyberReserve.sol";
import "../IERC20.sol";
import "../utils/Utils5.sol";
import "../utils/Withdrawable3.sol";
import "../utils/zeppelin/SafeERC20.sol";


contract KyberReserve2 is IKyberReserve, Utils5, Withdrawable3 {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    mapping(bytes32=>bool) public approvedWithdrawAddresses; // sha3(token,address)=>bool
    mapping(address=>address) public tokenWallet;

    address public kyberNetwork;
    bool public tradeEnabled;

    IConversionRates public conversionRatesContract;
    ISanityRates public sanityRatesContract;
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
    event WithdrawAddressApproved(IERC20 indexed token, address indexed addr, bool approve);
    event NewTokenWallet(IERC20 indexed token, address indexed wallet);
    event WithdrawFunds(IERC20 indexed token, uint256 amount, address indexed destination);
    event SetContractAddresses(
        address indexed network,
        IConversionRates indexed rate,
        IWeth weth,
        ISanityRates sanity
    );

    constructor(
        address _kyberNetwork,
        IConversionRates _ratesContract,
        IWeth _weth,
        address _admin
    )
        Withdrawable3(_admin) public
    {
        require(_ratesContract != IConversionRates(0), "ratesContract 0");
        require(_kyberNetwork != address(0), "kyberNetwork 0");
        require(_weth != IWeth(0), "weth 0");
        kyberNetwork = _kyberNetwork;
        conversionRatesContract = _ratesContract;
        weth = _weth;
        tradeEnabled = true;
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
        bool validate
    )
        override
        external
        payable
        returns(bool)
    {
        require(tradeEnabled, "trade not enable");
        require(msg.sender == kyberNetwork, "wrong sender");

        doTrade(srcToken, srcAmount, destToken, destAddress, conversionRate, validate);

        return true;
    }

    function enableTrade() onlyAdmin external returns(bool) {
        if (!tradeEnabled) {
            tradeEnabled = true;
            emit TradeEnabled(true);
        }
        return true;
    }

    function disableTrade() onlyAlerter external returns(bool) {
        if (tradeEnabled) {
            tradeEnabled = false;
            emit TradeEnabled(false);
        }
        return true;
    }

    function approveWithdrawAddress(IERC20 token, address addr, bool approve) onlyAdmin external {
        approvedWithdrawAddresses[keccak256(abi.encodePacked(address(token), addr))] = approve;
        setDecimals(token);
        emit WithdrawAddressApproved(token, addr, approve);
    }

    /// @dev allow set tokenWallet[token] back to 0x0 address
    function setTokenWallet(IERC20 token, address wallet) onlyAdmin external {
        if (tokenWallet[address(token)] != wallet) {
            tokenWallet[address(token)] = wallet;
            emit NewTokenWallet(token, wallet);
        }
        setDecimals(token);
    }

    /// @dev withdraw amount of token to an approved destination
    /// @dev if reserve is using weth instead of eth, should call withdraw weth
    /// @param token token to withdraw
    /// @param amount amount to withdraw
    /// @param destination address to transfer fund to
    function withdraw(IERC20 token, uint256 amount, address destination) onlyOperator external {
        require(
            approvedWithdrawAddresses[keccak256(abi.encodePacked(address(token), destination))],
            "destination is not approved"
        );

        if (token == ETH_TOKEN_ADDRESS) {
            (bool success, ) = destination.call{value: amount}("");
            require(success, "transfer back eth failed");
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

    function setContracts(
        address _kyberNetwork,
        IConversionRates _conversionRates,
        IWeth _weth,
        ISanityRates _sanityRates
    )
        onlyAdmin external
    {
        require(_kyberNetwork != address(0), "kyberNetwork 0");
        require(_conversionRates != IConversionRates(0), "conversionRates 0");
        require(_weth != IWeth(0), "weth 0");

        kyberNetwork = _kyberNetwork;
        conversionRatesContract = _conversionRates;
        weth = _weth;
        sanityRatesContract = _sanityRates;

        emit SetContractAddresses(
            kyberNetwork,
            conversionRatesContract,
            weth,
            sanityRatesContract
        );
    }

    function getConversionRate(
        IERC20 src,
        IERC20 dest,
        uint256 srcQty,
        uint256 blockNumber
    ) 
        override external view
        returns(uint256)
    {
        if (!tradeEnabled) return 0;

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

        uint256 rate = conversionRatesContract.getRate(token, blockNumber, isBuy, srcQty);
        uint256 destQty = getDestQty(src, dest, srcQty, rate);

        if (getBalance(dest) < destQty) return 0;

        if (sanityRatesContract != ISanityRates(0)) {
            uint256 sanityRate = sanityRatesContract.getSanityRate(src, dest);
            if (rate > sanityRate) return 0;
        }

        return rate;
    }

    function getBalance(IERC20 token) public view returns(uint256) {
        address wallet = getTokenWallet(token);
        if (token == ETH_TOKEN_ADDRESS) {
            if (wallet == address(this)) {
                // reserve should be using eth instead of weth
                return address(this).balance;
            }
            return weth.balanceOf(wallet);
        } else {
            if (wallet == address(this)) {
                // not set token wallet or reserve is the token wallet
                return token.balanceOf(address(this));
            }
            uint256 balanceOfWallet = token.balanceOf(wallet);
            uint256 allowanceOfWallet = token.allowance(wallet, address(this));

            return minOf(balanceOfWallet, allowanceOfWallet);
        }
    }

    function getDestQty(IERC20 src, IERC20 dest, uint256 srcQty, uint256 rate) public view returns(uint256) {
        uint256 dstDecimals = getDecimals(dest);
        uint256 srcDecimals = getDecimals(src);

        return calcDstQty(srcQty, srcDecimals, dstDecimals, rate);
    }

    /// @dev do a trade
    /// @param srcToken Src token
    /// @param srcAmount Amount of src token
    /// @param destToken Destination token
    /// @param destAddress Destination address to send tokens to
    /// @param validate If true, additional validations are applicable
    function doTrade(
        IERC20 srcToken,
        uint256 srcAmount,
        IERC20 destToken,
        address payable destAddress,
        uint256 conversionRate,
        bool validate
    )
        internal
    {
        // can skip validation if done at kyber network level
        if (validate) {
            require(conversionRate > 0, "rate is 0");
            if (srcToken == ETH_TOKEN_ADDRESS)
                require(msg.value == srcAmount, "wrong msg value");
            else
                require(msg.value == 0, "bad msg value");
        }

        uint256 destAmount = getDestQty(srcToken, destToken, srcAmount, conversionRate);
        // sanity check
        require(destAmount > 0, "dest amount is 0");

        // add to imbalance
        IERC20 token;
        int tradeAmount;
        if (srcToken == ETH_TOKEN_ADDRESS) {
            tradeAmount = int(destAmount);
            token = destToken;
        } else {
            tradeAmount = -1 * int(srcAmount);
            token = srcToken;
        }

        conversionRatesContract.recordImbalance(
            token,
            tradeAmount,
            0,
            block.number
        );

        // collect src tokens, transfer to token wallet if needed
        address srcTokenWallet = getTokenWallet(srcToken);
        if (srcToken == ETH_TOKEN_ADDRESS) {
            if (srcTokenWallet != address(this)) {
                // reserve is using weth instead of eth
                // convert eth to weth and send to weth's token wallet
                weth.deposit{value: msg.value}();
                IERC20(weth).safeTransfer(srcTokenWallet, msg.value);
            }
        } else {
            srcToken.safeTransferFrom(msg.sender, srcTokenWallet, srcAmount);
        }

        address destTokenWallet = getTokenWallet(destToken);
        // send dest tokens
        if (destToken == ETH_TOKEN_ADDRESS) {
            if (destTokenWallet != address(this)) {
                // transfer weth from weth's token wallet to this address
                // then unwrap weth to eth to this contract address
                IERC20(weth).safeTransferFrom(destTokenWallet, address(this), destAmount);
                weth.withdraw(destAmount);
            }
            // transfer eth to dest address
            (bool success, ) = destAddress.call{value: destAmount}("");
            require(success, "transfer back eth failed");
        } else {
            if (destTokenWallet == address(this)) {
                destToken.safeTransfer(destAddress, destAmount);
            } else {
                destToken.safeTransferFrom(destTokenWallet, destAddress, destAmount);
            }
        }

        emit TradeExecute(msg.sender, srcToken, srcAmount, destToken, destAmount, destAddress);
    }

    /// @dev return wallet that holds the token
    /// @dev if token is ETH, check tokenWallet of WETH instead
    /// @dev if wallet is 0x0, consider as this reserve address
    function getTokenWallet(IERC20 token) internal view returns(address wallet) {
        wallet = token == ETH_TOKEN_ADDRESS ? tokenWallet[address(weth)] : tokenWallet[address(token)];
        if (wallet == address(0)) {
            wallet = address(this);
        }
    }
}