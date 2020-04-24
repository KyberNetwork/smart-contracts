pragma solidity 0.5.11;

import "../../IERC20.sol";
import "../../IKyberReserve.sol";
import "../../utils/Withdrawable2.sol";
import "../../utils/Utils4.sol";
import "./mock/IBancorNetwork.sol";

contract KyberBancorReserve is IKyberReserve, Withdrawable2, Utils4 {

    uint constant ETH_BNT_DECIMALS = 18;

    address public kyberNetwork;
    bool public tradeEnabled;

    IBancorNetwork public bancorNetwork;

    IERC20 public bancorToken;
    IERC20[] public ethToBntPath;
    IERC20[] public bntToEthPath;

    constructor(
        address _bancorNetwork,
        address _kyberNetwork,
        address _bancorToken,
        address _admin
    )
        public Withdrawable2(_admin)
    {
        require(_bancorNetwork != address(0), "constructor: bancorNetwork address is missing");
        require(_kyberNetwork != address(0), "constructor: kyberNetwork address is missing");
        require(_bancorToken != address(0), "constructor: bancorToken address is missing");
        
        bancorNetwork = IBancorNetwork(_bancorNetwork);
        bancorToken = IERC20(_bancorToken);

        kyberNetwork = _kyberNetwork;
        admin = _admin;
        tradeEnabled = true;

        require(bancorToken.approve(address(bancorNetwork), 2 ** 255));
    }

    function() external payable { }

    function getConversionRate(IERC20 src, IERC20 dest, uint srcQty, uint) public view returns(uint) {
        if (!tradeEnabled) { return 0; }
        if (srcQty == 0) { return 0; }

        if (src != ETH_TOKEN_ADDRESS && dest != ETH_TOKEN_ADDRESS) {
            return 0; // either src or dest must be ETH
        }
        IERC20 token = src == ETH_TOKEN_ADDRESS ? dest : src;
        if (token != bancorToken) { return 0; } // not BNT token

        IERC20[] memory path = getConversionPath(src, dest);

        uint destQty;
        (destQty, ) = bancorNetwork.getReturnByPath(path, srcQty);

        // src and dest can be only BNT or ETH
        uint rate = calcRateFromQty(srcQty, destQty, ETH_BNT_DECIMALS, ETH_BNT_DECIMALS);

        return rate;
    }

    event TradeExecute(
        address indexed sender,
        address src,
        uint srcAmount,
        address destToken,
        uint destAmount,
        address payable destAddress
    );

    function trade(
        IERC20 srcToken,
        uint srcAmount,
        IERC20 destToken,
        address payable destAddress,
        uint conversionRate,
        bool validate
    )
        public
        payable
        returns(bool)
    {

        require(tradeEnabled, "trade: trade is not enabled");
        require(msg.sender == kyberNetwork, "trade: sender is not network");
        require(srcAmount > 0, "trade: src amount must be greater than 0");
        require(srcToken == ETH_TOKEN_ADDRESS || destToken == ETH_TOKEN_ADDRESS, "trade: src or dest must be ETH");
        require(srcToken == bancorToken || destToken == bancorToken, "trade: src or dest must be BNT");

        require(doTrade(srcToken, srcAmount, destToken, destAddress, conversionRate, validate), "trade: doTrade function returns false");

        return true;
    }

    event KyberNetworkSet(address kyberNetwork);

    function setKyberNetwork(address _kyberNetwork) public onlyAdmin {
        require(_kyberNetwork != address(0), "setKyberNetwork: kyberNetwork address is missing");

        kyberNetwork = _kyberNetwork;
        emit KyberNetworkSet(_kyberNetwork);
    }

    event BancorNetworkSet(address _bancorNetwork);

    function setBancorContract(address _bancorNetwork) public onlyAdmin {
        require(_bancorNetwork != address(0), "setBancorContract: bancorNetwork address is missing");

        require(bancorToken.approve(address(bancorNetwork), 0), "setBancorContract: can not reset allowance");

        bancorNetwork = IBancorNetwork(_bancorNetwork);
        require(bancorToken.approve(_bancorNetwork, 2 ** 255), "setBancorContract: can not approve token");

        emit BancorNetworkSet(_bancorNetwork);
    }

    event TradeEnabled(bool enable);

    function enableTrade() public onlyAdmin returns(bool) {
        tradeEnabled = true;
        emit TradeEnabled(true);

        return true;
    }

    event NewPathsSet(IERC20[] ethToBntPath, IERC20[] bntToEthPath);

    function setNewEthBntPath(IERC20[] memory _ethToBntPath, IERC20[] memory _bntToEthPath) public onlyAdmin {
        require(_ethToBntPath.length != 0, "setNewEthBntPath: path should have some elements");
        require(_bntToEthPath.length != 0, "setNewEthBntPath: path should have some elements");

        // verify if path returns value for rate
        // both ETH + BNT has same decimals of 18, using 1 ETH/BNT to get rate
        uint amount = PRECISION;
        uint destQty;

        (destQty, ) = bancorNetwork.getReturnByPath(_ethToBntPath, amount);
        require(destQty > 0, "setNewEthBntPath: no rate from eth to bnt with this path");

        (destQty, ) = bancorNetwork.getReturnByPath(_bntToEthPath, amount);
        require(destQty > 0, "setNewEthBntPath: no rate from bnt to eth with this path");

        ethToBntPath = _ethToBntPath;
        bntToEthPath = _bntToEthPath;

        emit NewPathsSet(_ethToBntPath, _bntToEthPath);
    }

    function disableTrade() public onlyAlerter returns(bool) {
        tradeEnabled = false;
        emit TradeEnabled(false);

        return true;
    }

    function doTrade(
        IERC20 srcToken,
        uint srcAmount,
        IERC20 destToken,
        address payable destAddress,
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
                require(msg.value == srcAmount, "doTrade: msg value is not correct for ETH trade");
            else
                require(msg.value == 0, "doTrade: msg value is not correct for token trade");
        }

        if (srcToken != ETH_TOKEN_ADDRESS) {
            // collect source amount
            require(srcToken.transferFrom(msg.sender, address(this), srcAmount), "doTrade: collect src token failed");
        }

        IERC20[] memory path = getConversionPath(srcToken, destToken);
        require(path.length > 0, "doTrade: couldn't find path");

        // BNT and ETH have the same decimals
        uint userExpectedDestAmount = calcDstQty(srcAmount, ETH_BNT_DECIMALS, ETH_BNT_DECIMALS, conversionRate);
        require(userExpectedDestAmount > 0, "doTrade: user expected amount must be greater than 0");
        uint destAmount;

        if (srcToken == ETH_TOKEN_ADDRESS) {
            destAmount = bancorNetwork.convert2.value(srcAmount)(path, srcAmount, userExpectedDestAmount, address(0), 0);
        } else {
            destAmount = bancorNetwork.claimAndConvert2(path, srcAmount, userExpectedDestAmount, address(0), 0);
        }

        require(destAmount >= userExpectedDestAmount, "doTrade: dest amount is lower than expected amount");

        // transfer back only expected dest amount
        if (destToken == ETH_TOKEN_ADDRESS) {
            destAddress.transfer(userExpectedDestAmount);
        } else {
            require(destToken.transfer(destAddress, userExpectedDestAmount), "doTrade: transfer back dest token failed");
        }

        emit TradeExecute(msg.sender, address(srcToken), srcAmount, address(destToken), userExpectedDestAmount, destAddress);
        return true;
    }

    function getConversionPath(IERC20 src, IERC20 dest) public view returns(IERC20[] memory path) {
        if (src == bancorToken) {
            path = bntToEthPath;
        } else if (dest == bancorToken) {
            path = ethToBntPath;
        }
        return path;
    }
}
