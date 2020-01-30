  
pragma  solidity 0.5.11;

import "./PermissionGroupsV5.sol";
import "./UtilsV5.sol";
import "./IKyberReserve.sol";
import "./IKyberHint.sol";
import "./IKyberTradeLogic.sol";


contract KyberTradelogic is IKyberTradeLogic, PermissionGroups, Utils {
    uint            public negligibleRateDiffBps = 10; // bps is 0.01%
    
    IKyberNetwork   public networkContract;
    IKyberHint      public hintParser;

    mapping(address=>uint) public reserveAddressToId;
    mapping(uint=>address[]) public reserveIdToAddresses;
    mapping(address=>bool) internal isFeePayingReserve;
    mapping(address=>IKyberReserve[]) public reservesPerTokenSrc; //reserves supporting token to eth
    mapping(address=>IKyberReserve[]) public reservesPerTokenDest;//reserves support eth to token

    constructor(address _admin) public
        PermissionGroups(_admin)
    { /* empty body */ }

    modifier onlyNetwork() {
        require(msg.sender == networkContract, "ONLY_NETWORK");
        _;
    }

    event NegligbleRateDiffBpsSet(uint negligibleRateDiffBps);
    function setNegligbleRateDiffBps(uint _negligibleRateDiffBps) external onlyAdmin {
        require(_negligibleRateDiffBps <= BPS, "rateDiffBps > BPS"); // at most 100%
        negligibleRateDiffBps = _negligibleRateDiffBps;
        emit NegligbleRateDiffBpsSet(negligibleRateDiffBps);
    }

    event NetworkContractUpdate(IKyberNetwork newNetwork);
    function setNetworkContract(IKyberNetwork _networkContract) external onlyAdmin {
        require(_newNetwork != IKyberNetwork(0), "network 0");
        emit NetworkContractUpdate(_networkContract);
        networkContract = _networkContract;
    }

    event HintContractUpdate(IKyberHint newHintParser);
    function setHintParser(IKyberHint _hintParser) external onlyAdmin {
        require(_hintParser != IKyberHint(0), "hint parser 0");
        emit HintContractUpdate(_hintParser);
        hintParser = _hintParser;
    }

    function addReserve(address reserve, uint reserveId, bool isFeePaying) onlyNetwork external returns (bool) {
        require(reserveAddressToId[reserve] == uint(0), "reserve has id");
        require(reserveId != 0, "reserveId = 0");

        if (reserveIdToAddresses[reserveId].length == 0) {
            reserveIdToAddresses[reserveId].push(reserve);
        } else {
            require(reserveIdToAddresses[reserveId][0] == address(0), "reserveId taken");
            reserveIdToAddresses[reserveId][0] = reserve;
        }

        reserveAddressToId[reserve] = reserveId;
        isFeePayingReserve[reserve] = isFeePaying;
        return true;
    }

    function removeReserve(address reserve) onlyNetwork external returns (bool) {
        require(reserveAddressToId[reserve] != uint(0), "reserve -> 0 reserveId");
        uint reserveId = reserveAddressToId[reserve];

        reserveIdToAddresses[reserveId].push(reserveIdToAddresses[reserveId][0]);
        reserveIdToAddresses[reserveId][0] = address(0);
        return true;
    }

    
    function listPairForReserve(IKyberReserve reserve, IERC20 token, bool ethToToken, bool tokenToEth, bool add) onlyNetwork external returns (bool) {
        require(reserveAddressToId[address(reserve)] != uint(0), "reserve -> 0 reserveId");
        if (ethToToken) {
            listPairs(IKyberReserve(reserve), token, false, add);
        }

        if (tokenToEth) {
            listPairs(IKyberReserve(reserve), token, true, add);
        }

        setDecimals(token);
        return true;
    }

    function listPairs(IKyberReserve reserve, IERC20 token, bool isTokenToEth, bool add) internal {
        uint i;
        IKyberReserve[] storage reserveArr = reservesPerTokenDest[address(token)];

        if (isTokenToEth) {
            reserveArr = reservesPerTokenSrc[address(token)];
        }

        for (i = 0; i < reserveArr.length; i++) {
            if (reserve == reserveArr[i]) {
                if (add) {
                    break; //already added
                } else {
                    //remove
                    reserveArr[i] = reserveArr[reserveArr.length - 1];
                    reserveArr.length--;
                    break;
                }
            }
        }

        if (add && i == reserveArr.length) {
            //if reserve wasn't found add it
            reserveArr.push(reserve);
        }
    }

    struct TradingReserves {
        IKyberReserve[] addresses;
        uint[] data; // data will hold hint type in cell 0. next cells for rates for x reserve, then is fee paying x reserves
        bool[] isFeePaying;
        uint decimals;
    }

    // enable up to x reserves for token to Eth and x for eth to token
    // if not hinted reserves use 1 reserve for each trade side
    struct TradeData {
        TradingReserves tokenToEth;
        TradingReserves ethToToken;
        uint[] results;
        uint[] fees;
        
        uint feePayingReservesBps;
    }

    function calcRatesAndAmounts(IERC20 src, IERC20 dest, uint srcAmount, uint[] calldata fees, bytes calldata hint)
        external view returns (uint[] memory results, IKyberReserve[] memory reserveAddresses, uint[] rates, uint[] splitValuesBps, bool[] isFeePaying)
    {
        TradeData memory tradeData;
        results = new uint[](uint(ResultIndex.resultLength));
        parseTradeDataHint(tradeData, hint);
    }

    function parseTradeDataHint(IERC20 src, IERC20 dest, uint[]memory fees, TradeData memory tradeData, bytes memory hint) internal {
        tradeData.tokenToEth.addresses = (src == ETH_TOKEN_ADDRESS) ?
            new IKyberReserve[](1) : reservesPerTokenSrc[address(src)];
        tradeData.ethToToken.addresses = (dest == ETH_TOKEN_ADDRESS) ?
            new IKyberReserve[](1) :reservesPerTokenDest[address(dest)];

        //PERM is treated as no hint, so we just return
        if (hint.length == 0 || hint.length == 4) {
            tradeData.tokenToEth.isFeePaying = new bool[](1);
            tradeData.tokenToEth.splitValuesBps = new uint[](1);
            tradeData.tokenToEth.rates = new uint[](1);
            tradeData.ethToToken.isFeePaying = new bool[](1);
            tradeData.ethToToken.splitValuesBps = new uint[](1);
            tradeData.ethToToken.rates = new uint[](1);
        } else {
            if (tradeData.input.src == ETH_TOKEN_ADDRESS) {
                (/*tradeData.ethToToken.tradeType*/, tradeData.ethToToken.addresses, tradeData.ethToToken.splitValuesBps, ) = 
                    hintParser.parseEthToTokenHint(hint);   
            } else if (tradeData.input.dest == ETH_TOKEN_ADDRESS) {
                (/*tradeData.tokenToEth.tradeType*/, tradeData.tokenToEth.addresses, tradeData.tokenToEth.splitValuesBps, ) = 
                hintParser.parseTokenToEthHint(hint);
            } else {
                (/*tradeData.tokenToEth.tradeType*/, tradeData.tokenToEth.addresses, tradeData.tokenToEth.splitValuesBps, 
                 /*tradeData.ethToToken.tradeType*/, tradeData.ethToToken.addresses, tradeData.ethToToken.splitValuesBps, ) = 
                 hintParser.parseTokenToTokenHint(hint);
            }
        }
    }
}

