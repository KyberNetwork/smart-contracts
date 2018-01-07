pragma solidity ^0.4.18;


import "./ERC20Interface.sol";
import "./KyberConstants.sol";
import "./Withdrawable.sol";
import "./Pricing.sol";
import "./VolumeImbalanceRecorder.sol";
import "./SanityPricing.sol";


/// @title Kyber Reserve contract

contract KyberReserve is Withdrawable, KyberConstants {

    address public kyberNetwork;
    bool public tradeEnabled;
    Pricing public pricingContract;
    SanityPricingInterface public sanityPricingContract;
    mapping(bytes32=>bool) public approvedWithdrawAddresses; // sha3(token,address)=>bool

    function KyberReserve(address _kyberNetwork, Pricing _pricingContract, address _admin) public {
        kyberNetwork = _kyberNetwork;
        pricingContract = _pricingContract;
        admin = _admin;
        tradeEnabled = true;
    }

    event DepositToken(ERC20 token, uint amount);

    function() payable public {
        DepositToken(ETH_TOKEN_ADDRESS, msg.value);
    }

    event DoTrade(
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

        assert(doTrade(sourceToken, sourceAmount, destToken, destAddress, conversionRate, validate));

        return true;
    }

    event EnableTrade(bool enable);

    function enableTrade() public onlyAdmin returns(bool) {
        tradeEnabled = true;
        EnableTrade(true);

        return true;
    }

    function disableTrade() public onlyAlerter returns(bool) {
        tradeEnabled = false;
        EnableTrade(false);

        return true;
    }

    event ApproveWithdrawAddress(ERC20 token, address addr, bool approve);

    function approveWithdrawAddress(ERC20 token, address addr, bool approve) public onlyAdmin {
        approvedWithdrawAddresses[keccak256(token, addr)] = approve;
        ApproveWithdrawAddress(token, addr, approve);
    }

    event Withdraw(ERC20 token, uint amount, address destination);

    function withdraw(ERC20 token, uint amount, address destination) public onlyOperator returns(bool) {
        require(approvedWithdrawAddresses[keccak256(token, destination)]);

        if(token == ETH_TOKEN_ADDRESS) {
            destination.transfer(amount);
        } else {
            assert(token.transfer(destination, amount));
        }

        Withdraw(token, amount, destination);

        return true;
    }

    function setContracts(address _kyberNetwork, Pricing _pricing, SanityPricingInterface _sanityPricing)
        public
        onlyAdmin
    {
        require(_kyberNetwork != address(0));
        require(_pricing != address(0));

        kyberNetwork = _kyberNetwork;
        pricingContract = _pricing;
        sanityPricingContract = _sanityPricing;
    }

    ////////////////////////////////////////////////////////////////////////////
    /// status functions ///////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////

    function getBalance(ERC20 token) public view returns(uint) {
        if(token == ETH_TOKEN_ADDRESS) return this.balance;
        else return token.balanceOf(this);
    }

    function getDecimals(ERC20 token) public view returns(uint) {
        if(token == ETH_TOKEN_ADDRESS) return 18;
        return token.decimals();
    }

    function getDestQty(ERC20 source, ERC20 dest, uint srcQty, uint rate) public view returns(uint) {
        uint dstDecimals = getDecimals(dest);
        uint srcDecimals = getDecimals(source);

        return calcDstQty(srcQty,srcDecimals,dstDecimals,rate);
    }

    function getSrcQty(ERC20 source, ERC20 dest, uint dstQty, uint rate) public view returns(uint) {
        uint dstDecimals = getDecimals(dest);
        uint srcDecimals = getDecimals(source);

        if( srcDecimals >= dstDecimals ) {
            require((srcDecimals-dstDecimals) <= MAX_DECIMALS);
            return (PRECISION * dstQty * (10**(srcDecimals - dstDecimals))) / rate;
        } else {
            require((dstDecimals-srcDecimals) <= MAX_DECIMALS);
            return (PRECISION * dstQty) / (rate * (10**(dstDecimals - srcDecimals)));
        }
    }

    function getConversionRate(ERC20 source, ERC20 dest, uint srcQty, uint blockNumber) public view returns(uint) {
        ERC20 token;
        bool  buy;

        if(ETH_TOKEN_ADDRESS == source) {
            buy = true;
            token = dest;
        } else if(ETH_TOKEN_ADDRESS == dest) {
            buy = false;
            token = source;
        } else {
            return 0; // pair is not listed
        }

        uint price = pricingContract.getPrice(token, blockNumber, buy, srcQty);
        uint destQty = getDestQty(source, dest, srcQty, price);

        if(getBalance(dest) < destQty) return 0;

        if(sanityPricingContract != address(0)) {
            uint sanityPrice = sanityPricingContract.getSanityPrice(source, dest);
            if(price > sanityPrice) return 0;
        }

        return price;
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
        if(validate) {
            require(conversionRate > 0);
            if(sourceToken == ETH_TOKEN_ADDRESS) require(msg.value == sourceAmount);
            else require(msg.value == 0);
        }

        uint destAmount = getDestQty(sourceToken, destToken, sourceAmount, conversionRate);
        // sanity check
        require(destAmount > 0);

        // add to imbalance
        ERC20 token;
        int buy;
        if(sourceToken == ETH_TOKEN_ADDRESS) {
            buy = int(destAmount);
            token = destToken;
        } else {
            buy = -1 * int(sourceAmount);
            token = sourceToken;
        }

        pricingContract.recordImbalance(
            token,
            buy,
            pricingContract.getPriceUpdateBlock(token),
            block.number
        );

        // collect source tokens
        if(sourceToken != ETH_TOKEN_ADDRESS) {
            assert(sourceToken.transferFrom(msg.sender, this, sourceAmount));
        }

        // send dest tokens
        if(destToken == ETH_TOKEN_ADDRESS) {
            destAddress.transfer(destAmount);
        } else {
            assert(destToken.transfer(destAddress, destAmount));
        }

        DoTrade(tx.origin, sourceToken, sourceAmount, destToken, destAmount, destAddress);

        return true;
    }
}
