pragma solidity 0.4.18;


import "./ERC20Interface.sol";
import "./Utils.sol";
import "./Withdrawable.sol";
import "./ConversionRates.sol";
import "./VolumeImbalanceRecorder.sol";
import "./SanityRates.sol";


/// @title Kyber Reserve contract
contract KyberReserve is Withdrawable, Utils {

    address public kyberNetwork;
    bool public tradeEnabled;
    ConversionRates public conversionRatesContract;
    SanityRatesInterface public sanityRatesContract;
    mapping(bytes32=>bool) public approvedWithdrawAddresses; // sha3(token,address)=>bool

    function KyberReserve(address _kyberNetwork, ConversionRates _ratesContract, address _admin) public {
        require(_admin != address(0));
        require(_ratesContract != address(0));
        require(_kyberNetwork != address(0));
        kyberNetwork = _kyberNetwork;
        conversionRatesContract = _ratesContract;
        admin = _admin;
        tradeEnabled = true;
    }

    event DepositToken(ERC20 token, uint amount);

    function() public payable {
        DepositToken(ETH_TOKEN_ADDRESS, msg.value);
    }

    event TradeExecute(
        address indexed origin,
        address source,
        uint sourceAmount,
        address destToken,
        uint destAmount,
        address destAddress
    );

    function trade(
        ERC20 sourceToken,
        uint sourceAmount,
        ERC20 destToken,
        address destAddress,
        uint conversionRate,
        bool validate
    )
        public
        payable
        returns(bool)
    {
        require(tradeEnabled);
        require(msg.sender == kyberNetwork);

        require(doTrade(sourceToken, sourceAmount, destToken, destAddress, conversionRate, validate));

        return true;
    }

    event TradeEnabled(bool enable);

    function enableTrade() public onlyAdmin returns(bool) {
        tradeEnabled = true;
        TradeEnabled(true);

        return true;
    }

    function disableTrade() public onlyAlerter returns(bool) {
        tradeEnabled = false;
        TradeEnabled(false);

        return true;
    }

    event WithdrawAddressApproved(ERC20 token, address addr, bool approve);

    function approveWithdrawAddress(ERC20 token, address addr, bool approve) public onlyAdmin {
        approvedWithdrawAddresses[keccak256(token, addr)] = approve;
        WithdrawAddressApproved(token, addr, approve);
    }

    event WithdrawFunds(ERC20 token, uint amount, address destination);

    function withdraw(ERC20 token, uint amount, address destination) public onlyOperator returns(bool) {
        require(approvedWithdrawAddresses[keccak256(token, destination)]);

        if (token == ETH_TOKEN_ADDRESS) {
            destination.transfer(amount);
        } else {
            require(token.transfer(destination, amount));
        }

        WithdrawFunds(token, amount, destination);

        return true;
    }

    function setContracts(address _kyberNetwork, ConversionRates _conversionRates, SanityRatesInterface _sanityRates)
        public
        onlyAdmin
    {
        require(_kyberNetwork != address(0));
        require(_conversionRates != address(0));

        kyberNetwork = _kyberNetwork;
        conversionRatesContract = _conversionRates;
        sanityRatesContract = _sanityRates;
    }

    ////////////////////////////////////////////////////////////////////////////
    /// status functions ///////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////
    function getBalance(ERC20 token) public view returns(uint) {
        if (token == ETH_TOKEN_ADDRESS)
            return this.balance;
        else
            return token.balanceOf(this);
    }

    function getDecimals(ERC20 token) public view returns(uint) {
        if (token == ETH_TOKEN_ADDRESS) return 18;
        return token.decimals();
    }

    function getDestQty(ERC20 source, ERC20 dest, uint sourceQty, uint rate) public view returns(uint) {
        uint dstDecimals = getDecimals(dest);
        uint sourceDecimals = getDecimals(source);

        return calcDstQty(sourceQty, sourceDecimals, dstDecimals, rate);
    }

    function getSourceQty(ERC20 source, ERC20 dest, uint dstQty, uint rate) public view returns(uint) {
        uint dstDecimals = getDecimals(dest);
        uint sourceDecimals = getDecimals(source);

        return calcSourceQty(dstQty, sourceDecimals, dstDecimals, rate);
    }

    function getConversionRate(ERC20 source, ERC20 dest, uint sourceQty, uint blockNumber) public view returns(uint) {
        ERC20 token;
        bool  buy;

        if (!tradeEnabled) return 0;

        if (ETH_TOKEN_ADDRESS == source) {
            buy = true;
            token = dest;
        } else if (ETH_TOKEN_ADDRESS == dest) {
            buy = false;
            token = source;
        } else {
            return 0; // pair is not listed
        }

        uint rate = conversionRatesContract.getRate(token, blockNumber, buy, sourceQty);
        uint destQty = getDestQty(source, dest, sourceQty, rate);

        if (getBalance(dest) < destQty) return 0;

        if (sanityRatesContract != address(0)) {
            uint sanityRate = sanityRatesContract.getSanityRate(source, dest);
            if (rate > sanityRate) return 0;
        }

        return rate;
    }

    /// @dev do a trade
    /// @param sourceToken Source token
    /// @param sourceAmount Amount of source token
    /// @param destToken Destination token
    /// @param destAddress Destination address to send tokens to
    /// @param validate If true, additional validations are applicable
    /// @return true iff trade is successful
    function doTrade(
        ERC20 sourceToken,
        uint sourceAmount,
        ERC20 destToken,
        address destAddress,
        uint conversionRate,
        bool validate
    )
        internal
        returns(bool)
    {
        // can skip validation if done at kyber network level
        if (validate) {
            require(conversionRate > 0);
            if (sourceToken == ETH_TOKEN_ADDRESS)
                require(msg.value == sourceAmount);
            else
                require(msg.value == 0);
        }

        uint destAmount = getDestQty(sourceToken, destToken, sourceAmount, conversionRate);
        // sanity check
        require(destAmount > 0);

        // add to imbalance
        ERC20 token;
        int buy;
        if (sourceToken == ETH_TOKEN_ADDRESS) {
            buy = int(destAmount);
            token = destToken;
        } else {
            buy = -1 * int(sourceAmount);
            token = sourceToken;
        }

        conversionRatesContract.recordImbalance(
            token,
            buy,
            0,
            block.number
        );

        // collect source tokens
        if (sourceToken != ETH_TOKEN_ADDRESS) {
            require(sourceToken.transferFrom(msg.sender, this, sourceAmount));
        }

        // send dest tokens
        if (destToken == ETH_TOKEN_ADDRESS) {
            destAddress.transfer(destAmount);
        } else {
            require(destToken.transfer(destAddress, destAmount));
        }

        TradeExecute(msg.sender, sourceToken, sourceAmount, destToken, destAmount, destAddress);

        return true;
    }
}
