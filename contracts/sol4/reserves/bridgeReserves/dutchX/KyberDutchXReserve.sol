pragma solidity 0.4.18;


import "../../../Withdrawable.sol";
import "../../../KyberReserveInterface.sol";
import "../../../Utils2.sol";


interface WETH9 {
    function approve(address spender, uint amount) public returns(bool);
    function withdraw(uint amount) public;
    function deposit() public payable;
}


interface DutchXExchange {
    // Two functions below are in fact: mapping (address => mapping (address => uint)) public sellVolumesCurrent;
    // Token => Token => amount
    function buyVolumes(address sellToken, address buyToken) public view returns (uint);
    function sellVolumesCurrent(address sellToken, address buyToken) public view returns (uint);
    function deposit(address tokenAddress,uint amount) public returns(uint);
    function postBuyOrder(address sellToken,address buyToken,uint auctionIndex,uint amount) public returns (uint);

    function claimBuyerFunds(address sellToken, address buyToken, address user, uint auctionIndex) public
        returns(uint returned, uint frtsIssued);

    function withdraw(address tokenAddress,uint amount) public returns (uint);
    function getAuctionIndex(address sellToken, address buyToken) public view returns(uint index);
    function getFeeRatio(address user) public view returns (uint num, uint den); // feeRatio < 10^4

    function getCurrentAuctionPrice(address sellToken, address buyToken, uint auctionIndex) public view
        returns (uint num, uint den);
}


contract KyberDutchXReserve is KyberReserveInterface, Withdrawable, Utils2 {

    uint public constant BPS = 10000;
    uint public constant DEFAULT_KYBER_FEE_BPS = 25;

    uint public feeBps = DEFAULT_KYBER_FEE_BPS;
    uint public dutchXFeeNum;
    uint public dutchXFeeDen;

    DutchXExchange public dutchX;
    address public kyberNetwork;
    WETH9 public weth;

    mapping(address => bool) public listedTokens;

    bool public tradeEnabled;

    /**
        Constructor
    */
    function KyberDutchXReserve(
        DutchXExchange _dutchX,
        address _admin,
        address _kyberNetwork,
        WETH9 _weth
    )
        public
    {
        require(address(_dutchX) != address(0));
        require(_admin != address(0));
        require(_kyberNetwork != address(0));
        require(_weth != WETH9(0));

        dutchX = _dutchX;
        admin = _admin;
        kyberNetwork = _kyberNetwork;
        weth = _weth;

        setDutchXFee();
        require(weth.approve(dutchX, 2 ** 255));
        setDecimals(ETH_TOKEN_ADDRESS);
    }

    function() public payable {
        // anyone can deposit ether
    }

    struct AuctionData {
        uint index;
        ERC20 srcToken;
        ERC20 dstToken;
        uint priceNum; // numerator
        uint priceDen; // denominator
    }

    /**
        Returns rate = dest quantity / source quantity.
    */
    function getConversionRate(
        ERC20 src,
        ERC20 dest,
        uint srcQty,
        uint blockNumber
    )
        public
        view
        returns(uint)
    {
        blockNumber;
        if (!tradeEnabled) return 0;

        if (src == ETH_TOKEN_ADDRESS) {
            if (!listedTokens[dest]) return 0;
        } else if (dest == ETH_TOKEN_ADDRESS) {
            if (!listedTokens[src]) return 0;
        } else {
            return 0;
        }

        AuctionData memory auctionData = getAuctionData(src, dest);
        if (auctionData.index == 0) return 0;

        (auctionData.priceNum, auctionData.priceDen) = dutchX.getCurrentAuctionPrice(
                auctionData.dstToken,
                auctionData.srcToken,
                auctionData.index
            );

        if (auctionData.priceNum == 0 || auctionData.priceDen == 0) return 0;

        if (!sufficientLiquidity(auctionData.srcToken, srcQty, auctionData.dstToken,
            auctionData.priceNum, auctionData.priceDen)) {
            return 0;
        }

        // if source is Eth, reduce kyber fee from source.
        uint actualSrcQty = (src == ETH_TOKEN_ADDRESS) ? srcQty * (BPS - feeBps) / BPS : srcQty;

        if (actualSrcQty == 0 || actualSrcQty * auctionData.priceDen < actualSrcQty) return 0;

        uint convertedQty = (actualSrcQty * auctionData.priceDen) / auctionData.priceNum;
        // reduce dutchX fees
        convertedQty = convertedQty * (dutchXFeeDen - dutchXFeeNum) / dutchXFeeDen;

        // if destination is Eth, reduce kyber fee from destination.
        convertedQty = (dest == ETH_TOKEN_ADDRESS) ? convertedQty * (BPS - feeBps) / BPS : convertedQty;

        // here use original srcQty, which will give the real rate (as seen by internal kyberNetwork)
        return calcRateFromQty(
            srcQty, /* srcAmount */
            convertedQty, /* destAmount */
            getDecimals(src), /* srcDecimals */
            getDecimals(dest) /* dstDecimals */
        );
    }

    event TradeExecute(
        address indexed sender,
        address src,
        uint srcAmount,
        address destToken,
        uint destAmount,
        address destAddress,
        uint auctionIndex
    );

    function trade(
        ERC20 srcToken,
        uint srcAmount,
        ERC20 destToken,
        address destAddress,
        uint conversionRate,
        bool validate
    )
        public
        payable
        returns(bool)
    {
        validate;

        require(tradeEnabled);
        require(msg.sender == kyberNetwork);

        AuctionData memory auctionData = getAuctionData(srcToken, destToken);
        require(auctionData.index != 0);

        uint actualSrcQty;

        if (srcToken == ETH_TOKEN_ADDRESS){
            require(srcAmount == msg.value);
            actualSrcQty = srcAmount * (BPS - feeBps) / BPS;
            weth.deposit.value(actualSrcQty)();
        } else {
            require(msg.value == 0);
            require(srcToken.transferFrom(msg.sender, address(this), srcAmount));
            actualSrcQty = srcAmount;
        }

        dutchX.deposit(auctionData.srcToken, actualSrcQty);
        dutchX.postBuyOrder(auctionData.dstToken, auctionData.srcToken, auctionData.index, actualSrcQty);

        uint destAmount;
        uint frtsIssued;
        (destAmount, frtsIssued) = dutchX.claimBuyerFunds(
            auctionData.dstToken,
            auctionData.srcToken,
            this,
            auctionData.index
        );

        dutchX.withdraw(auctionData.dstToken, destAmount);

        if (destToken == ETH_TOKEN_ADDRESS) {
            weth.withdraw(destAmount);
            destAmount = destAmount * (BPS - feeBps) / BPS;
            destAddress.transfer(destAmount);
        } else {
            require(auctionData.dstToken.transfer(destAddress, destAmount));
        }

        require(conversionRate <= calcRateFromQty(
            srcAmount, /* srcAmount */
            destAmount, /* destAmount */
            getDecimals(srcToken), /* srcDecimals */
            getDecimals(destToken) /* dstDecimals */
        ));
        
        TradeExecute(
            msg.sender, /* sender */
            srcToken, /* src */
            srcAmount, /* srcAmount */
            destToken, /* destToken */
            destAmount, /* destAmount */
            destAddress, /* destAddress */
            auctionData.index
        );

        return true;
    }

    event FeeUpdated(
        uint bps
    );

    function setFee(uint bps) public onlyAdmin {
        require(bps <= BPS);
        feeBps = bps;
        FeeUpdated(bps);
    }

    event TokenListed(
        ERC20 token
    );

    function listToken(ERC20 token)
        public
        onlyAdmin
    {
        require(address(token) != address(0));

        listedTokens[token] = true;
        setDecimals(token);
        require(token.approve(dutchX, 2**255));
        TokenListed(token);
    }

    event TokenDelisted(ERC20 token);

    function delistToken(ERC20 token)
        public
        onlyAdmin
    {
        require(listedTokens[token]);
        listedTokens[token] = false;

        TokenDelisted(token);
    }

    event TradeEnabled(
        bool enable
    );

    function setDutchXFee() public {
        (dutchXFeeNum, dutchXFeeDen) = dutchX.getFeeRatio(this);

        // can't use denominator 0 (EVM bad instruction)
        if (dutchXFeeDen == 0) {
            tradeEnabled = false;
        }

        TradeEnabled(tradeEnabled);
    }

    function disableTrade()
        public
        onlyAlerter
        returns(bool)
    {
        tradeEnabled = false;
        TradeEnabled(tradeEnabled);
        return true;
    }

    function enableTrade()
        public
        onlyAdmin
        returns(bool)
    {
        tradeEnabled = true;
        TradeEnabled(tradeEnabled);
        return true;
    }

    event KyberNetworkSet(
        address kyberNetwork
    );

    function setKyberNetwork(
        address _kyberNetwork
    )
        public
        onlyAdmin
    {
        require(_kyberNetwork != address(0));
        kyberNetwork = _kyberNetwork;
        KyberNetworkSet(kyberNetwork);
    }

    event Execution(bool success, address caller, address destination, uint value, bytes data);

    function executeTransaction(address destination, uint value, bytes data)
        public
        onlyOperator
    {
        if (destination.call.value(value)(data)) {
            Execution(true, msg.sender, destination, value, data);
        } else {
            revert();
        }
    }

    function sufficientLiquidity(ERC20 src, uint srcQty, ERC20 dest, uint priceNum, uint priceDen)
        internal view returns(bool)
    {
        uint buyVolume = dutchX.buyVolumes(dest, src);
        uint sellVolume = dutchX.sellVolumesCurrent(dest, src);

        // 10^30 * 10^37 = 10^67
        if (sellVolume * priceNum < sellVolume) return false;
        int outstandingVolume = int((sellVolume * priceNum) / priceDen) - int(buyVolume);
        if (outstandingVolume >= int(srcQty)) return true;

        return false;
    }

    function getAuctionData(ERC20 src, ERC20 dst) internal view returns (AuctionData data) {
        data.srcToken = src == ETH_TOKEN_ADDRESS ? ERC20(weth) : src;
        data.dstToken = dst == ETH_TOKEN_ADDRESS ? ERC20(weth) : dst;
        data.index = dutchX.getAuctionIndex(data.dstToken, data.srcToken);
    }
}
