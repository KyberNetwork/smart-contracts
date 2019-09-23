// /**
//  *Submitted for verification at Etherscan.io on 2019-09-09
// */

// pragma solidity ^0.5.10;

// interface ERC20 {
//     function totalSupply() external view returns (uint supply);
//     function balanceOf(address _owner) external view returns (uint balance);
//     function transfer(address _to, uint _value) external returns (bool success);
//     function transferFrom(address _from, address _to, uint _value) external returns (bool success);
//     function approve(address _spender, uint _value) external returns (bool success);
//     function allowance(address _owner, address _spender) external view returns (uint remaining);
//     function decimals() external view returns(uint digits);
//     event Approval(address indexed _owner, address indexed _spender, uint _value);
// }


// contract OtcInterface {
//     function getOffer(uint id) external view returns (uint, ERC20, uint, ERC20);
//     function getBestOffer(ERC20 sellGem, ERC20 buyGem) external view returns(uint);
//     function getWorseOffer(uint id) external view returns(uint);
//     function take(bytes32 id, uint128 maxTakeAmount) external;
// }


// contract WethInterface is ERC20 {
//     function deposit() public payable;
//     function withdraw(uint) public;
// }

// /// @title Kyber Reserve contract
// interface KyberReserveInterface {

//     function trade(
//         ERC20 srcToken,
//         uint srcAmount,
//         ERC20 destToken,
//         address payable destAddress,
//         uint conversionRate,
//         bool validate
//     )
//         external
//         payable
//         returns(bool);

//     function getConversionRate(ERC20 src, ERC20 dest, uint srcQty, uint blockNumber) external view returns(uint);
// }


// contract PermissionGroups {

//     address public admin;
//     address public pendingAdmin;
//     mapping(address=>bool) internal operators;
//     mapping(address=>bool) internal alerters;
//     address[] internal operatorsGroup;
//     address[] internal alertersGroup;
//     uint constant internal MAX_GROUP_SIZE = 50;

//     constructor() public {
//         admin = msg.sender;
//     }

//     modifier onlyAdmin() {
//         require(msg.sender == admin);
//         _;
//     }

//     modifier onlyOperator() {
//         require(operators[msg.sender]);
//         _;
//     }

//     modifier onlyAlerter() {
//         require(alerters[msg.sender]);
//         _;
//     }

//     function getOperators () external view returns(address[] memory) {
//         return operatorsGroup;
//     }

//     function getAlerters () external view returns(address[] memory) {
//         return alertersGroup;
//     }

//     event TransferAdminPending(address pendingAdmin);

//     /**
//      * @dev Allows the current admin to set the pendingAdmin address.
//      * @param newAdmin The address to transfer ownership to.
//      */
//     function transferAdmin(address newAdmin) public onlyAdmin {
//         require(newAdmin != address(0));
//         emit TransferAdminPending(pendingAdmin);
//         pendingAdmin = newAdmin;
//     }

//     /**
//      * @dev Allows the current admin to set the admin in one tx. Useful initial deployment.
//      * @param newAdmin The address to transfer ownership to.
//      */
//     function transferAdminQuickly(address newAdmin) public onlyAdmin {
//         require(newAdmin != address(0));
//         emit TransferAdminPending(newAdmin);
//         emit AdminClaimed(newAdmin, admin);
//         admin = newAdmin;
//     }

//     event AdminClaimed( address newAdmin, address previousAdmin);

//     /**
//      * @dev Allows the pendingAdmin address to finalize the change admin process.
//      */
//     function claimAdmin() public {
//         require(pendingAdmin == msg.sender);
//         emit AdminClaimed(pendingAdmin, admin);
//         admin = pendingAdmin;
//         pendingAdmin = address(0);
//     }

//     event AlerterAdded (address newAlerter, bool isAdd);

//     function addAlerter(address newAlerter) public onlyAdmin {
//         require(!alerters[newAlerter]); // prevent duplicates.
//         require(alertersGroup.length < MAX_GROUP_SIZE);

//         emit AlerterAdded(newAlerter, true);
//         alerters[newAlerter] = true;
//         alertersGroup.push(newAlerter);
//     }

//     function removeAlerter (address alerter) public onlyAdmin {
//         require(alerters[alerter]);
//         alerters[alerter] = false;

//         for (uint i = 0; i < alertersGroup.length; ++i) {
//             if (alertersGroup[i] == alerter) {
//                 alertersGroup[i] = alertersGroup[alertersGroup.length - 1];
//                 alertersGroup.length--;
//                 emit AlerterAdded(alerter, false);
//                 break;
//             }
//         }
//     }

//     event OperatorAdded(address newOperator, bool isAdd);

//     function addOperator(address newOperator) public onlyAdmin {
//         require(!operators[newOperator]); // prevent duplicates.
//         require(operatorsGroup.length < MAX_GROUP_SIZE);

//         emit OperatorAdded(newOperator, true);
//         operators[newOperator] = true;
//         operatorsGroup.push(newOperator);
//     }

//     function removeOperator (address operator) public onlyAdmin {
//         require(operators[operator]);
//         operators[operator] = false;

//         for (uint i = 0; i < operatorsGroup.length; ++i) {
//             if (operatorsGroup[i] == operator) {
//                 operatorsGroup[i] = operatorsGroup[operatorsGroup.length - 1];
//                 operatorsGroup.length -= 1;
//                 emit OperatorAdded(operator, false);
//                 break;
//             }
//         }
//     }
// }

// contract Withdrawable is PermissionGroups {

//     event TokenWithdraw(ERC20 token, uint amount, address sendTo);

//     /**
//      * @dev Withdraw all ERC20 compatible tokens
//      * @param token ERC20 The address of the token contract
//      */
//     function withdrawToken(ERC20 token, uint amount, address sendTo) external onlyAdmin {
//         require(token.transfer(sendTo, amount));
//         emit TokenWithdraw(token, amount, sendTo);
//     }

//     event EtherWithdraw(uint amount, address sendTo);

//     /**
//      * @dev Withdraw Ethers
//      */
//     function withdrawEther(uint amount, address payable sendTo) external onlyAdmin {
//         sendTo.transfer(amount);
//         emit EtherWithdraw(amount, sendTo);
//     }
// }


// // TODO: It's not reverted when qty is 0, should return first order rate
// contract ShowEth2DAI is KyberReserveInterface, Withdrawable {

//     // basicData contains compact data of min eth/dai support, max traverse and max takes
//     // min eth support (first 96 bits) + min dai support (next 96 bits) + max traverse (32 bits) + max takes (32 bits) = 256 bits
//     uint basicData;
//     // factorData contains compact data of factors to compute max traverse, max takes, and min take order size
//     // 6 params, each 32 bits (6 * 32 = 192 bits)
//     uint factorData;

//     struct BasicDataConfig {
//         uint minETHSupport;
//         uint minDAISupport;
//         uint maxTraverse;
//         uint maxTakes;
//     }

//     uint constant POW_2_32 = 2 ** 32;
//     uint constant POW_2_96 = 2 ** 96;
//     uint constant BASIC_FACTOR_STEP = 100000;

//     // constants
//     uint constant internal MAX_QTY = (10**28); // 10B tokens
//     uint constant internal MAX_RATE = (PRECISION * 10**6); // up to 1M tokens per ETH
//     uint constant internal PRECISION = 10**18;
//     uint constant internal INVALID_ID = uint(-1);
//     uint constant internal COMMON_DECIMALS = 18;
//     ERC20 constant internal ETH_TOKEN_ADDRESS = ERC20(0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);

//     // values
//     address public kyberNetwork;
//     bool public tradeEnabled;
//     uint public feeBps;

//     OtcInterface public otc = OtcInterface(0x39755357759cE0d7f32dC8dC45414CCa409AE24e);
//     WethInterface public wethToken = WethInterface(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
//     ERC20 public DAIToken = ERC20(0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359);

//     mapping(address => bool) isTokenListed;
//     // 96 bits: min token, 96 bits: max token, 32 bits: premiumBps, 32 bits: minSpreadBps;
//     mapping(address => uint) internalInventoryData;

//     struct InternalInventoryData {
//         uint minTokenBal;
//         uint maxTokenBal;
//         uint premiumBps;
//         uint minSpreadBps;
//     }

//     struct OfferData {
//         uint payAmount;
//         uint buyAmount;
//         uint id;
//     }

//     constructor(address _kyberNetwork, uint _feeBps, address _admin) public {
//         require(_kyberNetwork != address(0), "constructor: kyberNetwork's address is missing");
//         require(_feeBps < 10000, "constructor: fee > 10000");
//         require(_admin != address(0), "constructor: admin is missing");
//         require(wethToken.decimals() == COMMON_DECIMALS, "constructor: wethToken's decimals is not COMMON_DECIMALS");
//         require(wethToken.approve(address(otc), 2**255), "constructor: failed to approve otc (wethToken)");
    
//         // min eth support: 10, min dai support: 1000, max travese: 20, max take: 10
//         basicData = encodeBasicData(10, 1000, 20, 10);
//         // 0.00026, 4.93146, 0.00016, 2.60431, 0.02678, 150
//         factorData = encodeFactorData(26, 493146, 16, 260431, 2678, 15000000);
//         kyberNetwork = _kyberNetwork;
//         feeBps = _feeBps;
//         admin = _admin;
//     }

//     function() external payable {
//     }
    
//     function calcDaiTokenAmount (bool isEthToDai, uint payAmount, uint buyAmount, uint srcAmount) public pure returns (uint daiAmount, uint daiTokens) {
//         daiAmount = isEthToDai ? srcAmount * buyAmount / payAmount : srcAmount;
//         daiTokens = daiAmount / 10 ** 18;
//     }

//     /**
//         Returns conversion rate of given pair and srcQty, use 1 as srcQty if srcQty = 0
//         Using token amount to compute offer limit configurations
//         => need to check spread is ok for eth -> token
//         Last bit of the rate indicates whether to use internal inventory:
//           0 - use eth2dai
//           1 - use internal inventory
//     */
//     function getConversionRate(ERC20 src, ERC20 dest, uint srcQty, uint) public view returns(uint) {
//         if (!tradeEnabled) { return 0; }
//         // check if token's listed
//         ERC20 token = src == ETH_TOKEN_ADDRESS ? dest : src;
//         if (!isTokenListed[address(token)]) { return 0; }

//         // decode DAI basic data, here assuming we only support DAI first
//         InternalInventoryData memory inventoryData = getInternalInventoryData(token);
        
//         // Checking spread
//         OfferData memory bid;
//         OfferData memory ask;
//         (bid, ask) = getFirstBidAndAskOrders(token);

//         if (token == dest && !checkValidSpread(bid, ask, inventoryData.minSpreadBps)) {
//             // only pre-check spread if trade from eth -> token
//             // since we need to use equivalent token amount for findBestOffers
//             return 0;
//         }

//         uint destAmount;
//         OfferData[] memory offers;

//         // using 1 as default value if srcQty is 0
//         uint srcAmount = srcQty == 0 ? 1 : srcQty;
//         if (src == ETH_TOKEN_ADDRESS) {
//             (destAmount, offers) = findBestOffers(wethToken, dest, srcAmount, ask);
//         } else {
//             (destAmount, offers) = findBestOffers(src, wethToken, srcAmount, bid);
//         }
        
//         if (offers.length == 0) { return 0; } // no offer, return 0 for rate

//         uint rate = calcRateFromQty(srcAmount, destAmount, COMMON_DECIMALS, COMMON_DECIMALS);

//         bool useInternalInventory;
//         uint premiumBps;

//         if (src == ETH_TOKEN_ADDRESS) {
//             (useInternalInventory, premiumBps) = shouldUseInternalInventory(dest,
//                                                                             destAmount,
//                                                                             srcAmount,
//                                                                             true,
//                                                                             bid,
//                                                                             ask,
//                                                                             inventoryData);
//         } else {
//             (useInternalInventory, premiumBps) = shouldUseInternalInventory(src,
//                                                                             srcAmount,
//                                                                             destAmount,
//                                                                             false,
//                                                                             bid,
//                                                                             ask,
//                                                                             inventoryData);
//         }

//         if (useInternalInventory) return valueAfterAddingPremium(rate, premiumBps);
//         return valueAfterReducingFee(rate);
//     }

//     function applyInternalInventoryHintToRate(
//         uint rate,
//         bool useInternalInventory
//     )
//         internal
//         pure
//         returns(uint)
//     {
//         return rate % 2 == (useInternalInventory ? 1 : 0)
//             ? rate
//             : rate - 1;
//     }

//     function valueAfterReducingFee(uint val) public view returns(uint) {
//         require(val <= MAX_QTY, "valueAfterReducingFee: val > MAX_QTY");
//         return ((10000 - feeBps) * val) / 10000;
//     }

//     function valueAfterAddingPremium(uint val, uint premium) public pure returns(uint) {
//         require(val <= MAX_QTY, "valueAfterAddingPremium: val > MAX_QTY");
//         return val * (10000 + premium) / 10000;
//     }

//     event TradeExecute(
//         address indexed origin,
//         address src,
//         uint srcAmount,
//         address destToken,
//         uint destAmount,
//         address payable destAddress
//     );

//     function trade(
//         ERC20 srcToken,
//         uint srcAmount,
//         ERC20 destToken,
//         address payable destAddress,
//         uint conversionRate,
//         bool validate
//     )
//         public
//         payable
//         returns(bool)
//     {
//         require(tradeEnabled, "trade: tradeEnabled is false");
//         require(msg.sender == kyberNetwork, "trade: not call from kyberNetwork's contract");

//         ERC20 token = srcToken == ETH_TOKEN_ADDRESS ? destToken : srcToken;
//         require(isTokenListed[address(token)], "trade: token is not listed");

//         require(doTrade(srcToken, srcAmount, destToken, destAddress, conversionRate, validate), "trade: doTrade returns false");
//         return true;
//     }
    
//     /// @dev do a trade
//     /// @param srcToken Src token
//     /// @param srcAmount Amount of src token
//     /// @param destToken Destination token
//     /// @param destAddress Destination address to send tokens to
//     /// @return true iff trade is successful
//     function doTrade(
//         ERC20 srcToken,
//         uint srcAmount,
//         ERC20 destToken,
//         address payable destAddress,
//         uint conversionRate,
//         bool validate
//     )
//         internal
//         returns(bool)
//     {
//         // can skip validation if done at kyber network level
//         if (validate) {
//             require(conversionRate > 0, "doTrade: conversionRate is 0");
//             if (srcToken == ETH_TOKEN_ADDRESS)
//                 require(msg.value == srcAmount, "doTrade: msg.value != srcAmount");
//             else
//                 require(msg.value == 0, "doTrade: msg.value must be 0");
//         }

//         uint userExpectedDestAmount = calcDstQty(srcAmount, COMMON_DECIMALS, COMMON_DECIMALS, conversionRate);
//         require(userExpectedDestAmount > 0, "doTrade: userExpectedDestAmount == 0"); // sanity check

//         uint actualDestAmount;

//         // using hint to check if we should use our internal inventory
//         bool useInternalInventory = conversionRate % 2 == 1;

//         if (useInternalInventory) {
//             if (srcToken == ETH_TOKEN_ADDRESS) {
//                 // transfer back only requested dest amount.
//                 require(destToken.transfer(destAddress, userExpectedDestAmount), "doTrade: (useInternalInventory) can not transfer back token");
//             } else {
//                 // collect src token
//                 require(srcToken.transferFrom(msg.sender, address(this), srcAmount), "doTrade: (useInternalInventory) can not collect src token");
//                 // transfer back only requested dest amount.
//                 destAddress.transfer(userExpectedDestAmount);
//             }
//             emit TradeExecute(msg.sender, address(srcToken), srcAmount, address(destToken), userExpectedDestAmount, destAddress);
//             return true;
//         }

//         // get offers to take
//         OfferData [] memory offers;
//         (actualDestAmount, offers) = findBestOffers(srcToken, destToken, srcAmount, OfferData(0, 0, 0));
//         require(actualDestAmount > 0, "doTrade: actualDestAmount == 0");

//         // do trade with Eth2dai
//         if (srcToken == ETH_TOKEN_ADDRESS) {
//             wethToken.deposit.value(msg.value)();
//             actualDestAmount = takeMatchingOrders(destToken, srcAmount, offers);
//             require(actualDestAmount >= userExpectedDestAmount, "doTrade: actualDestAmount < userExpectedDestAmount, eth to token");
//             // transfer back only requested dest amount
//             require(destToken.transfer(destAddress, userExpectedDestAmount), "doTrade: can not transfer back requested token");
//         } else {
//             // collect src tokens
//             require(srcToken.transferFrom(msg.sender, address(this), srcAmount), "doTrade: can not collect src token");
//             actualDestAmount = takeMatchingOrders(wethToken, srcAmount, offers);
//             require(actualDestAmount >= userExpectedDestAmount, "doTrade: actualDestAmount < userExpectedDestAmount, token to eth");
//             wethToken.withdraw(actualDestAmount);
//             // transfer back only requested dest amount.
//             destAddress.transfer(userExpectedDestAmount);
//         }

//         emit TradeExecute(msg.sender, address(srcToken), srcAmount, address(destToken), userExpectedDestAmount, destAddress);
//         return true;
//     }

//     function takeMatchingOrders(ERC20 destToken, uint srcAmount, OfferData[] memory offers) internal returns(uint actualDestAmount) {
//         uint lastReserveBalance;
//         // to be safe, in fact destToken shouldn't be ETH
//         if (destToken == ETH_TOKEN_ADDRESS) {
//             lastReserveBalance = address(this).balance;
//         } else {
//             lastReserveBalance = destToken.balanceOf(address(this));
//         }
//         uint remainingSrcAmount = srcAmount;
//         for(uint i = 0; i < offers.length; i++) {
//             if (offers[i].id == 0 || remainingSrcAmount == 0) { break; }
//             uint takeAmount = remainingSrcAmount >= offers[i].payAmount ? offers[i].payAmount : remainingSrcAmount;
//             otc.take(bytes32(offers[i].id), uint128(takeAmount));
//             remainingSrcAmount -= takeAmount;
//         }
//         // make sure correct number of tokens transfer to this reserve
//         uint newReserveBalance = destToken.balanceOf(address(this));
//         require(newReserveBalance > lastReserveBalance, "takeMatchingOrders: newReserveBalance <= lastReserveBalance");
//         actualDestAmount = newReserveBalance - lastReserveBalance;
//     }

//     function shouldUseInternalInventory(ERC20 token,
//                                         uint tokenVal,
//                                         uint ethVal,
//                                         bool ethToToken,
//                                         OfferData memory bid,
//                                         OfferData memory ask,
//                                         InternalInventoryData memory inventoryData)
//         internal
//         view
//         returns(bool shouldUse, uint premiumBps)
//     {
//         require(tokenVal <= MAX_QTY, "shouldUseInternalInventory: tokenVal > MAX_QTY");

//         shouldUse = false;
//         premiumBps = inventoryData.premiumBps;

//         uint tokenBalance = token.balanceOf(address(this));

//         if (ethToToken) {
//             if (tokenBalance < tokenVal) { return (shouldUse, premiumBps); }
//             if (tokenVal - tokenVal < inventoryData.minTokenBal) { return (shouldUse, premiumBps); }
//         } else {
//             if (address(this).balance < ethVal) { return (shouldUse, premiumBps); }
//             if (tokenBalance + tokenVal > inventoryData.maxTokenBal) { return (shouldUse, premiumBps); }
//         }

//         if (!checkValidSpread(bid, ask, inventoryData.minSpreadBps)) {
//             return (shouldUse, premiumBps);
//         }

//         shouldUse = true;
//     }

//     event ConfigDataSet(
//         uint maxTraverse, uint traveseFactorX, uint traveseFactorY,
//         uint maxTake, uint takeFactorX, uint takeFactorY,
//         uint minSizeFactorX, uint minSizeFactorY, uint minETHSupport, uint minDAISupport
//     );

//     function setConfigData(
//         uint maxTraverse, uint traveseFactorX, uint traveseFactorY,
//         uint maxTake, uint takeFactorX, uint takeFactorY,
//         uint minSizeFactorX, uint minSizeFactorY, uint minETHSupport, uint minDAISupport) public {
//         basicData = encodeBasicData(minETHSupport, minDAISupport, maxTraverse, maxTake);
//         factorData = encodeFactorData(
//             traveseFactorX,
//             traveseFactorY,
//             takeFactorX,
//             takeFactorY,
//             minSizeFactorX,
//             minSizeFactorY
//         );
//         emit ConfigDataSet(
//             maxTraverse, traveseFactorX, takeFactorY,
//             maxTake, takeFactorX, takeFactorY,
//             minSizeFactorX, minSizeFactorY, minETHSupport, minDAISupport
//         );
//     }

//     event TradeEnabled(bool enable);

//     function enableTrade() public onlyAdmin returns(bool) {
//         tradeEnabled = true;
//         emit TradeEnabled(true);

//         return true;
//     }

//     function disableTrade() public onlyAlerter returns(bool) {
//         tradeEnabled = false;
//         emit TradeEnabled(false);

//         return true;
//     }

//     event KyberNetworkSet(address kyberNetwork);

//     function setKyberNetwork(address _kyberNetwork) public onlyAdmin {
//         require(_kyberNetwork != address(0), "setKyberNetwork: kyberNetwork's address is missing");

//         kyberNetwork = _kyberNetwork;
//         emit KyberNetworkSet(kyberNetwork);
//     }

//     event InternalInventoryDataSet(uint minToken, uint maxToken, uint pricePremiumBps, uint minSpreadBps);

//     function setInternalInventoryData(ERC20 token, uint minToken, uint maxToken, uint pricePremiumBps, uint minSpreadBps) public {
//         require(isTokenListed[address(token)], "setInternalInventoryData: token is not listed");
//         require(minToken < POW_2_96, "setInternalInventoryData: minToken > 2**96");
//         require(maxToken < POW_2_96, "setInternalInventoryData: maxToken > 2**96");
//         require(pricePremiumBps < POW_2_32, "setInternalInventoryData: pricePremiumBps > 2**32");
//         require(minSpreadBps < POW_2_32, "setInternalInventoryData: minSpreadBps > 2**32");

//         internalInventoryData[address(token)] = encodeBasicData(minToken, maxToken, pricePremiumBps, minSpreadBps);

//         emit InternalInventoryDataSet(minToken, maxToken, pricePremiumBps, minSpreadBps);
//     }

//     event TokenListed(ERC20 token);

//     function listToken(ERC20 token) public onlyAdmin {
//         address tokenAddr = address(token);

//         require(tokenAddr != address(0), "listToken: token's address is missing");
//         require(!isTokenListed[tokenAddr], "listToken: token's alr listed");
//         require(getDecimals(token) == COMMON_DECIMALS, "listToken: token's decimals is not COMMON_DECIMALS");
//         require(token.approve(address(otc), 2**255), "listToken: approve token otc failed");

//         isTokenListed[tokenAddr] = true;
//         internalInventoryData[tokenAddr] = encodeBasicData(POW_2_96 - 1, 0, 0, 0);

//         emit TokenListed(token);
//     }

//     event TokenDelisted(ERC20 token);

//     function delistToken(ERC20 token) public onlyAdmin {
//         address tokenAddr = address(token);

//         require(isTokenListed[tokenAddr], "delistToken: token is not listed");
//         require(token.approve(address(otc), 0), "delistToken: reset approve token failed");

//         delete isTokenListed[tokenAddr];
//         delete internalInventoryData[tokenAddr];

//         emit TokenDelisted(token);
//     }

//     event FeeBpsSet(uint feeBps);

//     function setFeeBps(uint _feeBps) public onlyAdmin {
//         require(_feeBps < 10000, "setFeeBps: feeBps >= 10000");

//         feeBps = _feeBps;
//         emit FeeBpsSet(feeBps);
//     }

//     function showBestOffers(bool isEthToDai, uint srcAmountToken) public view
//         returns(uint destAmount, uint destAmountToken, uint [] memory offerIds) 
//     {
//         OfferData [] memory offers;
//         ERC20 dstToken = isEthToDai ? DAIToken : wethToken;
//         ERC20 srcToken = isEthToDai ? wethToken : DAIToken;

//         (destAmount, offers) = findBestOffers(dstToken, srcToken, (srcAmountToken * 10 ** 18), OfferData(0, 0, 0));
        
//         destAmountToken = destAmount / 10 ** 18;
        
//         uint i;
//         for (i; i < offers.length; i++) {
//             if (offers[i].id == 0) {
//                 break;
//             }
//         }
    
//         offerIds = new uint[](i);
//         for (i = 0; i < offerIds.length; i++) {
//             offerIds[i] = offers[i].id;
//         }
//     }    
    
//     function findBestOffers(ERC20 dstToken, ERC20 srcToken, uint srcAmount, OfferData memory firstOffer) internal view
//       returns(uint totalDestAmount, OfferData [] memory offers)
//     {
//         uint remainingSrcAmount = srcAmount;
//         uint maxOrdersToTake;
//         uint maxTraversedOrders;
//         uint minTakeAmount;
//         uint numTakenOffer;
//         totalDestAmount = 0;

//         BasicDataConfig memory baseData = getBasicData();
//         // returns earlier if src amount is lower than supported trade amount of this reserve
//         if ((srcToken == wethToken && baseData.minETHSupport > srcAmount) || (srcToken == DAIToken && baseData.minDAISupport > srcAmount)) {
//             offers = new OfferData[](0);
//             return (totalDestAmount, offers);
//         }

//         offers = new OfferData[](baseData.maxTraverse);

//         // otc's terminology is of offer maker, so their sellGem is our (the taker's) dest token.
//         // if we don't have first offer, try to get it
//         if (firstOffer.id == 0) {
//             offers[0].id = otc.getBestOffer(dstToken, srcToken);
//             // assuming pay amount is taker pay amount. (in otc it is used differently)
//             (offers[0].buyAmount, , offers[0].payAmount, ) = otc.getOffer(offers[0].id);
//         } else {
//             offers[0] = firstOffer;
//         }

//         // src amount is 0, consider as taking the first order
//         if (remainingSrcAmount == 0) {
//             return (totalDestAmount, offers);
//         }

//         (maxOrdersToTake, maxTraversedOrders, minTakeAmount) = calcOfferLimitsFromFactorData(
//             (srcToken == wethToken),
//             offers[0].payAmount,
//             offers[0].buyAmount,
//             srcAmount
//         );
//         // compute max traversed orders and takes for this trade
//         maxOrdersToTake = minOf(maxOrdersToTake, baseData.maxTakes);
//         maxTraversedOrders = minOf(maxTraversedOrders, baseData.maxTraverse);

//         uint thisOffer;

//         OfferData memory biggestSkippedOffer;

//         for ( ;maxTraversedOrders > 0 ; --maxTraversedOrders) {
//             thisOffer = numTakenOffer;

//             // in case both biggestSkippedOffer & current offer have amount >= remainingSrcAmount
//             // biggestSkippedOffer should have better rate than current offer
//             if (biggestSkippedOffer.payAmount >= remainingSrcAmount) {
//                 offers[numTakenOffer].id = biggestSkippedOffer.id;
//                 offers[numTakenOffer].buyAmount = remainingSrcAmount * biggestSkippedOffer.buyAmount / biggestSkippedOffer.payAmount;
//                 offers[numTakenOffer].payAmount = remainingSrcAmount;
//                 totalDestAmount += offers[numTakenOffer].buyAmount;
//                 ++numTakenOffer;
//                 remainingSrcAmount = 0;
//                 break;
//             } else if (offers[numTakenOffer].payAmount >= remainingSrcAmount) {
//                 offers[numTakenOffer].buyAmount = remainingSrcAmount * offers[numTakenOffer].buyAmount / offers[numTakenOffer].payAmount;
//                 offers[numTakenOffer].payAmount = remainingSrcAmount;
//                 totalDestAmount += offers[numTakenOffer].buyAmount;
//                 ++numTakenOffer;
//                 remainingSrcAmount = 0;
//                 break;
//             } else if ((maxOrdersToTake - numTakenOffer) > 1 && 
//                         offers[numTakenOffer].payAmount >= remainingSrcAmount / (maxOrdersToTake - numTakenOffer)) {
//                 totalDestAmount += offers[numTakenOffer].buyAmount;
//                 remainingSrcAmount -= offers[numTakenOffer].payAmount;
//                 ++numTakenOffer;
//             } else if (offers[numTakenOffer].payAmount > biggestSkippedOffer.payAmount) {
//                 biggestSkippedOffer.payAmount = offers[numTakenOffer].payAmount;
//                 biggestSkippedOffer.buyAmount = offers[numTakenOffer].buyAmount;
//                 biggestSkippedOffer.id = offers[numTakenOffer].id;
//             }

//             offers[numTakenOffer].id = otc.getWorseOffer(offers[thisOffer].id);
//             (offers[numTakenOffer].buyAmount, , offers[numTakenOffer].payAmount, ) = otc.getOffer(offers[numTakenOffer].id);
//         }

//         if (remainingSrcAmount > 0) totalDestAmount = 0;
//         if (totalDestAmount == 0) numTakenOffer = 0;
//     }

//     function takeBestOffers(ERC20 dstToken, ERC20 srcToken, uint srcAmount) internal returns(uint actualDestAmount) {
//         OfferData [] memory offers;

//         (actualDestAmount, offers) = findBestOffers(dstToken, srcToken, srcAmount, OfferData(0, 0, 0));

//         for (uint i = 0; i < offers.length; ++i) {

//             if (offers[i].payAmount == 0) break;
//             require(offers[i].payAmount <= MAX_QTY, "takeBestOffers: payAmount > MAX_QTY");
//             otc.take(bytes32(offers[i].id), uint128(offers[i].payAmount));  // Take the portion of the offer that we need
//         }

//         return actualDestAmount;
//     }

//     // returns max takes, max traveser, min order size to take using config factor data
//     function calcOfferLimitsFromFactorData(bool isEthToDai, uint order0Pay, uint order0Buy, uint srcAmount) public view
//         returns(uint maxTakes, uint maxTraverse, uint minAmountPayToken)
//     {
//         uint daiOrderSize = isEthToDai ? srcAmount * order0Buy / order0Pay : srcAmount;
//         uint minAmountDai;

//         uint traverseX;
//         uint traverseY;
//         uint takeX;
//         uint takeY;
//         uint minSizeX;
//         uint minSizeY;
//         (traverseX, traverseY, takeX, takeY, minSizeX, minSizeY) = decodeFactorData(factorData);

//         maxTraverse = (traverseX * daiOrderSize + traverseY) / BASIC_FACTOR_STEP;
//         maxTakes = (takeX * daiOrderSize + takeY) / BASIC_FACTOR_STEP;
//         minAmountDai = (minSizeX * daiOrderSize + minSizeY) / BASIC_FACTOR_STEP;

//         // translate min amount to pay token
//         minAmountPayToken = isEthToDai ? minAmountDai * order0Buy / order0Pay : minAmountDai;
//     }

//     function getNextBestOffer(
//         ERC20 offerSellGem,
//         ERC20 offerBuyGem,
//         uint payAmount,
//         uint prevOfferId
//     )
//         internal
//         view
//         returns(
//             uint offerId,
//             uint offerPayAmount,
//             uint offerBuyAmount
//         )
//     {
//         if (prevOfferId == INVALID_ID) {
//             offerId = otc.getBestOffer(offerSellGem, offerBuyGem);
//         } else {
//             offerId = otc.getWorseOffer(prevOfferId);
//         }

//         (offerBuyAmount, ,offerPayAmount, ) = otc.getOffer(offerId);

//         while (payAmount > offerPayAmount) {
//             offerId = otc.getWorseOffer(offerId); // next best offer
//             if (offerId == 0) {
//                 offerId = 0;
//                 offerPayAmount = 0;
//                 offerBuyAmount = 0;
//                 break;
//             }
//             (offerBuyAmount, ,offerPayAmount, ) = otc.getOffer(offerId);
//         }
//     }
    
//     function getEthToDaiOrders(uint numOrders) public view
//         returns(uint [] memory ethPayAmtTokens, uint [] memory daiBuyAmtTokens, uint [] memory rateDaiDivEthx10, uint [] memory Ids,
//         uint totalBuyAmountDAIToken, uint totalPayAmountEthers, uint totalRateDaiDivEthx10) 
//     {
//         uint offerId = INVALID_ID;
//         ethPayAmtTokens = new uint[](numOrders);
//         daiBuyAmtTokens = new uint[](numOrders);    
//         rateDaiDivEthx10 = new uint[](numOrders);
//         Ids = new uint[](numOrders);
        
//         uint offerBuyAmt;
//         uint offerPayAmt;
        
//         for (uint i = 0; i < numOrders; i++) {
            
//             (offerId, offerPayAmt, offerBuyAmt) = getNextBestOffer(DAIToken, wethToken, 1, offerId);
            
//             totalBuyAmountDAIToken += offerBuyAmt;
//             totalPayAmountEthers += offerPayAmt;
            
//             ethPayAmtTokens[i] = offerPayAmt / 10 ** 18;
//             daiBuyAmtTokens[i] = offerBuyAmt / 10 ** 18;
//             rateDaiDivEthx10[i] = (offerBuyAmt * 10) / offerPayAmt;
//             Ids[i] = offerId;
            
//             if(offerId == 0) break;
//         }
        
//         totalRateDaiDivEthx10 = totalBuyAmountDAIToken * 10 / totalPayAmountEthers;
//         totalBuyAmountDAIToken /= 10 ** 18;
//         totalPayAmountEthers /= 10 ** 18;
//     }
    
//     function getDaiToEthOrders(uint numOrders) public view
//         returns(uint [] memory daiPayAmtTokens, uint [] memory ethBuyAmtTokens, uint [] memory rateDaiDivEthx10, uint [] memory Ids,
//         uint totalPayAmountDAIToken, uint totalBuyAmountEthers, uint totalRateDaiDivEthx10)
//     {
//         uint offerId = INVALID_ID;
//         daiPayAmtTokens = new uint[](numOrders);
//         ethBuyAmtTokens = new uint[](numOrders);
//         rateDaiDivEthx10 = new uint[](numOrders);
//         Ids = new uint[](numOrders);
        
//         uint offerBuyAmt;
//         uint offerPayAmt;

//         for (uint i = 0; i < numOrders; i++) {

//             (offerId, offerPayAmt, offerBuyAmt) = getNextBestOffer(wethToken, DAIToken, 1, offerId);
            
//             totalPayAmountDAIToken += offerPayAmt;
//             totalBuyAmountEthers += offerBuyAmt;
            
//             daiPayAmtTokens[i] = offerPayAmt / 10 ** 18;
//             ethBuyAmtTokens[i] = offerBuyAmt / 10 ** 18;
//             rateDaiDivEthx10[i] = (offerPayAmt * 10) / offerBuyAmt;
//             Ids[i] = offerId;
            
//             if(offerId == 0) break;
//         }
        
//         totalRateDaiDivEthx10 = totalPayAmountDAIToken * 10 / totalBuyAmountEthers;
//         totalPayAmountDAIToken /= 10 ** 18;
//         totalBuyAmountEthers /= 10 ** 18;
//     }

//     function getFirstBidAndAskOrders(ERC20 token) internal view returns(OfferData memory bid, OfferData memory ask) {
//         // getting first bid offer (buy token from weth)
//         (bid.id, bid.payAmount, bid.buyAmount) = getNextBestOffer(wethToken, token, 0, INVALID_ID);
//         // getting first ask offer (sell token to weth)
//         (ask.id, ask.payAmount, ask.buyAmount) = getNextBestOffer(token, wethToken, 0, INVALID_ID);
//     }
    
//     function checkValidSpread(OfferData memory bid, OfferData memory ask, uint minSpreadBps) internal pure returns(bool) {
//         if (bid.buyAmount > MAX_QTY || bid.payAmount > MAX_QTY || ask.buyAmount > MAX_QTY || ask.payAmount > MAX_QTY) {
//             return false;
//         }
//         // check if there is arbitrage or spread
//         uint x1 = ask.buyAmount * bid.payAmount;
//         uint x2 = ask.payAmount * bid.buyAmount;
//         if (x1 > x2) { return false; }
//         if (10000 * (x2 - x1) < x2 * minSpreadBps) { return false; }
//         return true;
//     }

//     function getBasicData() 
//         internal view 
//         returns(BasicDataConfig memory data)
//     {
//         (data.minETHSupport, data.minDAISupport, data.maxTraverse, data.maxTakes) = decodeBasicData(basicData);
//     }

//     function getFactorData() 
//         public view 
//         returns(uint traverseX, uint traverseY, uint takeX, uint takeY, uint minSizeX, uint minSizeY)
//     {
//         (traverseX, traverseY, takeX, takeY, minSizeX, minSizeY) = decodeFactorData(factorData);
//     }

//     function getInternalInventoryData(ERC20 token)
//         internal view
//         returns(InternalInventoryData memory data)
//     {
//         (uint minTokenBal, uint maxTokenBal, uint premiumBps, uint minSpreadBps) = decodeBasicData(internalInventoryData[address(token)]);
//         data.minTokenBal = minTokenBal;
//         data.maxTokenBal = maxTokenBal;
//         data.premiumBps = premiumBps;
//         data.minSpreadBps = minSpreadBps;
//     }

//     function encodeBasicData(uint ethSize, uint daiSize, uint maxTraverse, uint maxTakes) 
//         internal
//         pure
//         returns(uint data)
//     {
//         data = maxTakes & (POW_2_32 - 1);
//         data |= (maxTraverse & (POW_2_32 - 1)) * POW_2_32;
//         data |= (daiSize & (POW_2_96 - 1)) * POW_2_32 * POW_2_32;
//         data |= (ethSize & (POW_2_96 - 1)) * POW_2_96 * POW_2_32 * POW_2_32;
//     }

//     function decodeBasicData(uint data) 
//         internal
//         pure
//         returns(uint ethSize, uint daiSize, uint maxTraverse, uint maxTakes)
//     {
//         maxTakes = data & (POW_2_32 - 1);
//         maxTraverse = (data / POW_2_32) & (POW_2_32 - 1);
//         daiSize = (data / (POW_2_32 * POW_2_32)) & (POW_2_96 - 1);
//         ethSize = (data / (POW_2_96 * POW_2_32 * POW_2_32)) & (POW_2_96 - 1);
//     }

//     function encodeFactorData(uint traverseX, uint traverseY, uint takeX, uint takeY, uint minSizeX, uint minSizeY)
//         internal
//         pure
//         returns(uint data)
//     {
//         data = (minSizeY & (POW_2_32 - 1));
//         data |= (minSizeX & (POW_2_32 - 1)) * POW_2_32;
//         data |= (takeY & (POW_2_32 - 1)) * POW_2_32 * POW_2_32;
//         data |= (takeX & (POW_2_32 - 1)) * POW_2_96;
//         data |= (traverseY & (POW_2_32 - 1)) * POW_2_96 * POW_2_32;
//         data |= (traverseX & (POW_2_32 - 1)) * POW_2_96 * POW_2_32 * POW_2_32;
//     }

//     function decodeFactorData(uint data)
//         internal
//         pure
//         returns(uint traverseX, uint traverseY, uint takeX, uint takeY, uint minSizeX, uint minSizeY)
//     {
//         minSizeY = data & (POW_2_32 - 1);
//         minSizeX = (data / POW_2_32) & (POW_2_32 - 1);
//         takeY = (data / (POW_2_32 * POW_2_32)) & (POW_2_32 - 1);
//         takeX = (data / POW_2_96) & (POW_2_32 - 1);
//         traverseY = (data / (POW_2_96 * POW_2_32)) & (POW_2_32 - 1);
//         traverseX = (data / (POW_2_96 * POW_2_32 * POW_2_32)) & (POW_2_32 - 1);
//     }

//     function minOf(uint x, uint y) internal pure returns(uint) {
//         return x > y ? y : x;
//     }

//     function calcRateFromQty(uint srcAmount, uint destAmount, uint srcDecimals, uint dstDecimals)
//         internal pure returns(uint)
//     {
//         require(srcAmount <= MAX_QTY, "calcRateFromQty: srcAmount is bigger than MAX_QTY");
//         require(destAmount <= MAX_QTY, "calcRateFromQty: destAmount is bigger than MAX_QTY");

//         if (dstDecimals >= srcDecimals) {
//             require((dstDecimals - srcDecimals) <= COMMON_DECIMALS, "calcRateFromQty: dstDecimals - srcDecimals > COMMON_DECIMALS");
//             return (destAmount * PRECISION / ((10 ** (dstDecimals - srcDecimals)) * srcAmount));
//         } else {
//             require((srcDecimals - dstDecimals) <= COMMON_DECIMALS, "calcRateFromQty: srcDecimals - dstDecimals > COMMON_DECIMALS");
//             return (destAmount * PRECISION * (10 ** (COMMON_DECIMALS - dstDecimals)) / srcAmount);
//         }
//     }

//     function calcDstQty(uint srcQty, uint srcDecimals, uint dstDecimals, uint rate) internal pure returns(uint) {
//         require(srcQty <= MAX_QTY, "calcDstQty: srcQty is bigger than MAX_QTY");
//         require(rate <= MAX_RATE, "calcDstQty: rate is bigger than MAX_RATE");

//         if (dstDecimals >= srcDecimals) {
//             require((dstDecimals - srcDecimals) <= COMMON_DECIMALS, "calcDstQty: dstDecimals - srcDecimals > COMMON_DECIMALS");
//             return (srcQty * rate * (10**(dstDecimals - srcDecimals))) / PRECISION;
//         } else {
//             require((srcDecimals - dstDecimals) <= COMMON_DECIMALS, "calcDstQty: srcDecimals - dstDecimals > COMMON_DECIMALS");
//             return (srcQty * rate) / (PRECISION * (10**(srcDecimals - dstDecimals)));
//         }
//     }
    
//     function getDecimals(ERC20 token) internal view returns(uint) {
//         if (token == ETH_TOKEN_ADDRESS) { return COMMON_DECIMALS; }
//         return token.decimals();
//     }

//     function validTokens(ERC20 src, ERC20 dest) internal view returns (bool valid) {
//         return ((isTokenListed[address(src)] && ETH_TOKEN_ADDRESS == dest) ||
//                 (isTokenListed[address(dest)] && ETH_TOKEN_ADDRESS == src));
//     }
// }