pragma solidity 0.5.9;

import "../ERC20Interface.sol";
import "./MockKyberNetworkInterfaceV5.sol";
import "./MockKyberNetworkProxyInterfaceV5.sol";
import "./ReentrancyGuardV5.sol";

contract MockKyberNetworkV5 is MockKyberNetworkInterfaceV5, ReentrancyGuardV5 {
    MockKyberNetworkProxyInterfaceV5 public networkProxyContract;
    mapping(bytes32=>uint) public pairRate; //rate in precision units. i.e. if rate is 10**18 its same as 1:1
    uint constant public PRECISION = 10 ** 18;
    ERC20 constant internal ETH_TOKEN_ADDRESS = ERC20(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);

    function() external payable {}

    // @dev trade function with same prototype as KyberNetwork
    // only can be called by networkProxyContract
    // will be used only to trade token to Ether,
    // will work only when set pair worked.
    // hint is NOT USED
    function tradeWithHint(
        ERC20 src,
        uint srcAmount,
        ERC20 dest,
        address payable destAddress,
        uint maxDestAmount,
        uint minConversionRate,
        address walletId,
        bytes calldata hint
    )
        external
        nonReentrant
        payable
        returns(uint)
    {
        uint rate = pairRate[keccak256(abi.encodePacked(src, dest))];

        walletId;
        hint;

        require(msg.sender == address(networkProxyContract));
        require(srcAmount != 0);
        require(rate > 0);
        require(rate > minConversionRate);
        require(dest == ETH_TOKEN_ADDRESS);

        uint destAmount = srcAmount * rate / PRECISION;
        uint actualSrcAmount = srcAmount;

        if (destAmount > maxDestAmount) {
            destAmount = maxDestAmount;
            actualSrcAmount = maxDestAmount * PRECISION / rate;
        }

        destAddress.transfer(destAmount);

        return destAmount;
    }

    function getExpectedRate(ERC20 src, ERC20 dest, uint srcQty)
        external view
        returns(uint expectedRate, uint slippageRate)
    {
        srcQty;
        expectedRate = pairRate[keccak256(abi.encodePacked(src, dest))];
        slippageRate = expectedRate * 97 / 100;
    }

    function setProxyContract(MockKyberNetworkProxyInterfaceV5 _networkProxyContract) public {
        require(address(_networkProxyContract) != address(0));
        networkProxyContract = _networkProxyContract;
    }

    function setPairRate(ERC20 src, ERC20 dest, uint rate) public {
        pairRate[keccak256(abi.encodePacked(src, dest))] = rate;
    }
}
