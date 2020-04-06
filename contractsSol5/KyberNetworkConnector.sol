pragma solidity 0.5.11;

import "./utils/Withdrawable2.sol";
import "./utils/Utils4.sol";
import "./utils/zeppelin/ReentrancyGuard.sol";
import "./utils/zeppelin/SafeERC20.sol";
import "./IKyberNetwork.sol";


/*
 *   @title Kyber Network Connector main contract
 *   Interacts with contracts:
 *       KyberNetwork: to call  fee data
 *       KyberNetworkProxy: only proxy can call tradeWithHint
 *
 *    Kyber Network Connector will call KyberNetwork for:
 *       - getExpectedRateWithHintAndFee
 *       - tradeWithHintAndFee
 */

contract KyberNetworkConnector is
    Withdrawable2,
    Utils4,
    ReentrancyGuard
{
    using SafeERC20 for IERC20;

    uint  internal constant PERM_HINT_GET_RATE = 1 << 255;
    address internal constant ZERO_ADDRESS = address(uint160(0));
    IKyberNetwork public kyberNetwork;
    address public networkProxy;

    constructor(address _admin) public Withdrawable2(_admin) {}

    event KyberProxyAdded(address proxy);
    event KyberNetworkAdded(address network);

    function setKyberNetwork(address _kyberNetwork) external onlyAdmin {
        require(_kyberNetwork != address(0), "proxy 0");
        kyberNetwork = IKyberNetwork(_kyberNetwork);
        emit KyberNetworkAdded(_kyberNetwork);
    }

    function setKyberProxy(address _networkProxy) external onlyAdmin {
        require(_networkProxy != address(0), "proxy 0");
        networkProxy = _networkProxy;
        emit KyberProxyAdded(networkProxy);
    }

    function maxGasPrice() public view returns(uint) {
        return kyberNetwork.maxGasPrice();
    }

    function enabled() public view returns(bool) {
        return kyberNetwork.enabled();
    }

    function getExpectedRate(ERC20 src, ERC20 dest, uint256 srcQty)
        public
        view
        returns (uint256 expectedRate, uint256 slippageRate)
    {
        bytes memory hint;
        ( , expectedRate, ) = kyberNetwork.getExpectedRateWithHintAndFee(src, dest, srcQty, 0, hint);
        // use simple backward compatible optoin.
        slippageRate = expectedRate * 97 / 100;
    }

    function prepareTrade(IERC20 src, uint srcAmount) internal
    {
        require(msg.sender == networkProxy, "only Proxy");
        if (src != ETH_TOKEN_ADDRESS) {
            // get min of currentBalance and srcAmount and then transfer to network.
            // in case token taking fee to transfer network will cover fee
            uint curentBalance = getBalance(src, address(this));
            uint sentBalance = srcAmount < curentBalance ? curentBalance : curentBalance;
            src.safeTransferFrom(address(this), address(kyberNetwork), sentBalance);
        }
    }
    function tradeWithHint(ERC20 src, uint srcAmount, ERC20 dest, address destAddress, uint maxDestAmount,
        uint minConversionRate, address walletId, bytes calldata hint)
        external payable
        returns(uint)
    {
        prepareTrade(src, srcAmount);
        return kyberNetwork.tradeWithHintAndFee.value(msg.value)(
            msg.sender,
            src,
            srcAmount,
            dest,
            address(uint160(destAddress)),
            maxDestAmount,
            minConversionRate,
            address(uint160(walletId)),
            0,
            hint
        );
    }
}
