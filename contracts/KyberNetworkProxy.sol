pragma solidity 0.4.18;


import "./ERC20Interface.sol";
import "./Withdrawable.sol";
import "./Utils.sol";
import "./PermissionGroups.sol";
import "./KyberReserveInterface.sol";
import "./KyberNetworkInterface.sol";


////////////////////////////////////////////////////////////////////////////////////////////////////////
/// @title Kyber Network Wrap main contract
contract KyberNetworkWrapper is Withdrawable, Utils {

    KyberNetworkInterface public kyberNetworkContract;
    mapping(bytes32=>uint) public info; // this is only a UI field for external app.

    function KyberNetworkWrapper(address _admin) public {
        require(_admin != address(0));
        admin = _admin;
    }

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev makes a trade between src and dest token and send dest token to destAddress
    /// @param src Src token
    /// @param srcAmount amount of src tokens
    /// @param dest   Destination token
    /// @param destAddress Address to send tokens to
    /// @param maxDestAmount A limit on the amount of dest tokens
    /// @param minConversionRate The minimal conversion rate. If actual rate is lower, trade is canceled.
    /// @param walletId is the wallet ID to send part of the fees
    /// @return amount of actual dest tokens
    function trade(
        ERC20 src,
        uint srcAmount,
        ERC20 dest,
        address destAddress,
        uint maxDestAmount,
        uint minConversionRate,
        address walletId
    )
        public
        payable
        returns(uint)
    {
        uint userSrcBalanceBefore;
        uint userSrcBalanceAfter;
        uint userDestBalanceBefore;
        uint userDestBalanceAfter;

        userSrcBalanceBefore = getBalance(src, msg.sender);
        if (src == ETH_TOKEN_ADDRESS)
            userSrcBalanceBefore += msg.value;
        userDestBalanceBefore = getBalance(dest, destAddress);

        uint actualDestAmount = kyberNetworkContract.doTrade(
            msg.sender,
            src,
            srcAmount,
            dest,
            destAddress,
            maxDestAmount,
            minConversionRate,
            walletId
        );
        require(actualDestAmount > 0);

        userSrcBalanceAfter = getBalance(src, msg.sender);
        userDestBalanceAfter = getBalance(dest, destAddress);

        require(userSrcBalanceAfter < userSrcBalanceBefore);
        require(userDestBalanceAfter > userDestBalanceBefore);

        require((userDestBalanceAfter - userDestBalanceBefore) >=
            calcDstQty((userSrcBalanceBefore - userSrcBalanceAfter), getDecimals(src), getDecimals(dest),
                minConversionRate));

        return actualDestAmount;
    }

    event KyberNetworkSet(address networkContract);
    function setKyberNetworkContract(
        KyberNetworkInterface _kyberNetworkContract
    )
        public
        onlyAdmin
    {
        require(_kyberNetworkContract != address(0));
        kyberNetworkContract = _kyberNetworkContract;
        KyberNetworkSet(kyberNetworkContract);
    }

    function getExpectedRate(ERC20 src, ERC20 dest, uint srcQty)
        public view
        returns (uint expectedRate, uint slippageRate)
    {
        return kyberNetworkContract.getExpectedRate(src, dest, srcQty);
    }

    function getUserCapInWei(address user) public view returns(uint) {
        return kyberNetworkContract.getUserCapInWei(user);
    }

    function getMaxGasPriceWei() public view returns (uint) {
        return kyberNetworkContract.maxGasPrice();
    }

    function enalbed() public view returns (bool) {
        return kyberNetworkContract.isEnabled();
    }

    function info(bytes32 id) public view returns(uint) {
        kyberNetworkContract.getInfo(id);
    }

    /// @dev get the balance of a user.
    /// @param token The token type
    /// @return The balance
    function getBalance(ERC20 token, address user) public view returns(uint) {
        if (token == ETH_TOKEN_ADDRESS)
            return user.balance;
        else
            return token.balanceOf(user);
    }
}