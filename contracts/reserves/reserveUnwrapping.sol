pragma solidity 0.4.18;

import "./KyberReserve.sol";


interface Chai {
    function draw(address src, uint wad) external;
}


contract WethInterface is ERC20 {
    function deposit() public payable;
    function withdraw(uint) public;
}


contract reserveUnwrapping is KyberReserve {

    mapping (address=>address) unwrapContract;

    ERC20 public constant DAI = ERC20(0x6B175474E89094C44Da98b954EedeAC495271d0F);
    Chai public constant CHAI = Chai(0x0000000000000000000000000000000000000000);
    WethInterface public constant WETH = WethInterface(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);

    /// @dev do a trade
    /// @param srcToken Src token
    /// @param srcAmount Amount of src token
    /// @param destToken Destination token
    /// @param destAddress Destination address to send tokens to
    /// @param validate If true, additional validations are applicable
    /// @return true iff trade is successful
    function doTrade(
        ERC20 srcToken,
        uint srcAmount,
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
            if (srcToken == ETH_TOKEN_ADDRESS)
                require(msg.value == srcAmount);
            else
                require(msg.value == 0);
        }

        uint destAmount = getDestQty(srcToken, destToken, srcAmount, conversionRate);
        // sanity check
        require(destAmount > 0);

        // add to imbalance
        ERC20 token;
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

        // collect src tokens
        if (srcToken != ETH_TOKEN_ADDRESS) {
            require(srcToken.transferFrom(msg.sender, tokenWallet[srcToken], srcAmount));
        }

        // send dest tokens
        bool unwrappedToken = unwrap(token, destAmount);

        if (destToken == ETH_TOKEN_ADDRESS) {
            destAddress.transfer(destAmount);
        } else {
            if (unwrappedToken) {
                require(destToken.transfer(destAddress, destAmount));
            } else {
                require(destToken.transferFrom(tokenWallet[destToken], destAddress, destAmount));
            }
        }

        TradeExecute(msg.sender, srcToken, srcAmount, destToken, destAmount, destAddress);

        return true;
    }

    function unwrap(ERC20 token, uint destAmount) internal returns (bool) {
        // the function signature can be saved as part of unwrap data.
        if (unwrapContract[address(token)] == address(0)) return false;

        if (token == DAI) {
            CHAI.draw(address(this), destAmount);
        } else if (token == ETH_TOKEN_ADDRESS) {
            WETH.withdraw(destAmount);
        } else {
            // all the rest
            WethInterface(unwrapContract[address(token)]).withdraw(destAmount);
        }

        return true;
    }
}
