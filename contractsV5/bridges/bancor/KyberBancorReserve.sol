pragma solidity 0.5.11;

import "../../IERC20.sol";
import "../../IKyberReserve.sol";
import "../../WithdrawableV5.sol";
import "../../UtilsV5.sol";
import "./mock/IBancorNetwork.sol";

contract KyberBancorReserve is IKyberReserve, Withdrawable, Utils {

    uint constant internal BPS = 10000; // 10^4
    uint constant ETH_BNT_DECIMALS = 18;

    address public kyberNetwork;
    bool public tradeEnabled;
    uint public feeBps;

    IBancorNetwork public bancorNetwork; // 0x0e936B11c2e7b601055e58c7E32417187aF4de4a

    IERC20 public bancorEth; // 0xc0829421C1d260BD3cB3E0F06cfE2D52db2cE315
    IERC20 public bancorETHBNT; // 0xb1CD6e4153B2a390Cf00A6556b0fC1458C4A5533
    IERC20 public bancorToken; // 0x1F573D6Fb3F13d689FF844B4cE37794d79a7FF1C

    constructor(
        address _bancorNetwork,
        address _kyberNetwork,
        uint _feeBps,
        address _bancorEth,
        address _bancorETHBNT,
        address _bancorToken,
        address _admin
    )
        public
    {
        require(_bancorNetwork != address(0), "constructor: bancorNetwork address is missing");
        require(_kyberNetwork != address(0), "constructor: kyberNetwork address is missing");
        require(_bancorEth != address(0), "constructor: bancorEth address is missing");
        require(_bancorETHBNT != address(0), "constructor: bancorETHBNT address is missing");
        require(_bancorToken != address(0), "constructor: bancorToken address is missing");
        require(_admin != address(0), "constructor: admin address is missing");
        require(_feeBps < BPS, "constructor: fee is too big");

        bancorNetwork = IBancorNetwork(_bancorNetwork);
        bancorToken = IERC20(_bancorToken);
        bancorEth = IERC20(_bancorEth);
        bancorETHBNT = IERC20(_bancorETHBNT);

        kyberNetwork = _kyberNetwork;
        feeBps = _feeBps;
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

        rate = valueAfterReducingFee(rate);

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

        if (address(bancorNetwork) != address(0)) {
            require(bancorToken.approve(address(bancorNetwork), 0), "setBancorContract: can not reset approve token");
        }
        bancorNetwork = IBancorNetwork(_bancorNetwork);
        require(bancorToken.approve(address(bancorNetwork), 2 ** 255), "setBancorContract: can not approve token");

        emit BancorNetworkSet(_bancorNetwork);
    }

    event FeeBpsSet(uint feeBps);

    function setFeeBps(uint _feeBps) public onlyAdmin {
        require(_feeBps < BPS, "setFeeBps: feeBps >= BPS");

        feeBps = _feeBps;
        emit FeeBpsSet(feeBps);
    }

    event TradeEnabled(bool enable);

    function enableTrade() public onlyAdmin returns(bool) {
        tradeEnabled = true;
        emit TradeEnabled(true);

        return true;
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
            // trade from BNT to ETH
            path = new IERC20[](3);
            path[0] = bancorToken;
            path[1] = bancorETHBNT;
            path[2] = bancorEth;
            return path;
        } else if (dest == bancorToken) {
            // trade from ETH to BNT
            path = new IERC20[](3);
            path[0] = bancorEth;
            path[1] = bancorETHBNT;
            path[2] = bancorToken;
            return path;
        }
    }

    function valueAfterReducingFee(uint val) internal view returns(uint) {
        require(val <= MAX_QTY, "valueAfterReducingFee: val > MAX_QTY");
        return ((BPS - feeBps) * val) / BPS;
    }
}
