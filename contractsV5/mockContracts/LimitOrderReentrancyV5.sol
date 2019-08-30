pragma solidity 0.5.9;

import "../KyberSwapLimitOrderV5.sol";


contract LimitOrderReentrancy {
    KyberSwapLimitOrderV5 public limitOrder;
    address public user;
    uint256 public nonce;
    ERC20 public srcToken;
    uint256 public srcQty;
    ERC20 public destToken;
    address payable public destAddress;
    uint256 public minConversionRate;
    uint256 public feeInPrecision;
    uint8 public v;
    bytes32 public r;
    bytes32 public s;

    constructor(KyberSwapLimitOrderV5 _limitOrder) public {
        limitOrder = _limitOrder;
    }

    function() external payable {
        limitOrder.executeLimitOrder(user, nonce, srcToken, srcQty,
            destToken, destAddress, minConversionRate, feeInPrecision, v, r, s);
    }

    function executeLimitOrder(
    address _user,
    uint256 _nonce,
    ERC20 _srcToken,
    uint256 _srcQty,
    ERC20 _destToken,
    address payable _destAddress,
    uint256 _minConversionRate,
    uint256 _feeInPrecision,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
    )
    public
    {
        user = _user;
        nonce = _nonce;
        srcToken = _srcToken;
        srcQty = _srcQty;
        destToken = _destToken;
        destAddress = _destAddress;
        minConversionRate = _minConversionRate;
        feeInPrecision = _feeInPrecision;
        v = _v;
        r = _r;
        s = _s;
        limitOrder.executeLimitOrder(user, nonce, srcToken, srcQty,
            destToken, destAddress, minConversionRate, feeInPrecision, v, r, s);
    }
}
