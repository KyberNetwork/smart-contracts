var Web3 = require('web3');


var networkABI =
[{"constant":false,"inputs":[{"name":"alerter","type":"address"}],"name":"removeAlerter","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"reserve","type":"address"},{"name":"src","type":"address"},{"name":"dest","type":"address"},{"name":"add","type":"bool"}],"name":"listPairForReserve","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"","type":"address"},{"name":"","type":"bytes32"}],"name":"perReserveListedPairs","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"getReserves","outputs":[{"name":"","type":"address[]"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"enabled","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"pendingAdmin","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"getOperators","outputs":[{"name":"","type":"address[]"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"token","type":"address"},{"name":"amount","type":"uint256"},{"name":"sendTo","type":"address"}],"name":"withdrawToken","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"maxGasPrice","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"newAlerter","type":"address"}],"name":"addAlerter","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"negligibleRateDiff","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"feeBurnerContract","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"expectedRateContract","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"whiteListContract","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"field","type":"bytes32"},{"name":"value","type":"uint256"}],"name":"setInfo","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"user","type":"address"}],"name":"getUserCapInWei","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"newAdmin","type":"address"}],"name":"transferAdmin","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"_enable","type":"bool"}],"name":"setEnable","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[],"name":"claimAdmin","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"","type":"address"}],"name":"isReserve","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"newAdmin","type":"address"}],"name":"transferAdminQuickly","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"getAlerters","outputs":[{"name":"","type":"address[]"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"src","type":"address"},{"name":"dest","type":"address"},{"name":"srcQty","type":"uint256"}],"name":"getExpectedRate","outputs":[{"name":"expectedRate","type":"uint256"},{"name":"slippageRate","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"","type":"uint256"}],"name":"reserves","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"newOperator","type":"address"}],"name":"addOperator","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"reserve","type":"address"},{"name":"add","type":"bool"}],"name":"addReserve","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"operator","type":"address"}],"name":"removeOperator","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"_whiteList","type":"address"},{"name":"_expectedRate","type":"address"},{"name":"_feeBurner","type":"address"},{"name":"_maxGasPrice","type":"uint256"},{"name":"_negligibleRateDiff","type":"uint256"}],"name":"setParams","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"","type":"bytes32"}],"name":"info","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"src","type":"address"},{"name":"dest","type":"address"},{"name":"srcQty","type":"uint256"}],"name":"findBestRate","outputs":[{"name":"","type":"uint256"},{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"src","type":"address"},{"name":"srcAmount","type":"uint256"},{"name":"dest","type":"address"},{"name":"destAddress","type":"address"},{"name":"maxDestAmount","type":"uint256"},{"name":"minConversionRate","type":"uint256"},{"name":"walletId","type":"address"}],"name":"trade","outputs":[{"name":"","type":"uint256"}],"payable":true,"stateMutability":"payable","type":"function"},{"constant":false,"inputs":[{"name":"amount","type":"uint256"},{"name":"sendTo","type":"address"}],"name":"withdrawEther","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"getNumReserves","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"token","type":"address"},{"name":"user","type":"address"}],"name":"getBalance","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"admin","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"inputs":[{"name":"_admin","type":"address"}],"payable":false,"stateMutability":"nonpayable","type":"constructor"},{"payable":true,"stateMutability":"payable","type":"fallback"},{"anonymous":false,"inputs":[{"indexed":true,"name":"sender","type":"address"},{"indexed":false,"name":"amount","type":"uint256"}],"name":"EtherReceival","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"sender","type":"address"},{"indexed":false,"name":"src","type":"address"},{"indexed":false,"name":"dest","type":"address"},{"indexed":false,"name":"actualSrcAmount","type":"uint256"},{"indexed":false,"name":"actualDestAmount","type":"uint256"}],"name":"ExecuteTrade","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"reserve","type":"address"},{"indexed":false,"name":"add","type":"bool"}],"name":"AddReserveToNetwork","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"reserve","type":"address"},{"indexed":false,"name":"src","type":"address"},{"indexed":false,"name":"dest","type":"address"},{"indexed":false,"name":"add","type":"bool"}],"name":"ListReservePairs","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"token","type":"address"},{"indexed":false,"name":"amount","type":"uint256"},{"indexed":false,"name":"sendTo","type":"address"}],"name":"TokenWithdraw","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"amount","type":"uint256"},{"indexed":false,"name":"sendTo","type":"address"}],"name":"EtherWithdraw","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"pendingAdmin","type":"address"}],"name":"TransferAdminPending","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"newAdmin","type":"address"},{"indexed":false,"name":"previousAdmin","type":"address"}],"name":"AdminClaimed","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"newAlerter","type":"address"},{"indexed":false,"name":"isAdd","type":"bool"}],"name":"AlerterAdded","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"newOperator","type":"address"},{"indexed":false,"name":"isAdd","type":"bool"}],"name":"OperatorAdded","type":"event"}];


url = "http://localhost:8545/jsonrpc";
url = "https://mainnet.infura.io";
var web3 = new Web3(new Web3.providers.HttpProvider(url));

var networkAddress = "0x964F35fAe36d75B1e72770e244F6595B68508CF5";

var networkAddress = new web3.eth.Contract(networkABI, networkAddress);



var EOS = "0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0";
var KNC = "0xdd974d5c2e2928dea5f71b9825b8b646686bd200";
var OMG = "0xd26114cd6EE289AccF82350c8d8487fedB8A0C07";
var SNT = "0x744d70fdbe2ba4cf95131626614a1763df805b9e";
var BAT = "0x0d8775f648430679a709e98d2b0cb6250d2887ef";
var ELF = "0xbf2179859fc6d5bee9bf9158632dc51678a4100e";
var GIFTO = "0xc5bbae50781be1669306b9e001eff57a2957b09d";
var REQ = "0x8f8221afbb33998d8584a2b05749ba73c37a938a";
var MANA = "0x0f5d2fb29fb7d3cfee444a200298f468908cc942";
var POWR = "0x595832f8fc6bf59c85c527fec3740a1b7a361269";
var ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
var ENG = "0xf0ee6b27b759c9893ce4f094b49ad28fd15a23e4";
var RDN = "0x255aa6df07540cb5d3d297f0d0d4d84cb52bc8e6";
var SALT = "0x4156D3342D5c385a87D264F90653733592000581";
var APPC = "0x1a7a8BD9106F2B8D977E08582DC7d24c723ab0DB";
var BQX = "0x5af2be193a6abca9c8817001f45744777db30756";

var names = ["ETH","EOS", "KNC", "OMG", "SNT", "BAT", "ELF", "GIFTO", "REQ", "MANA", "POWR","ENG","RDN","SALT","APPC","BQX"];
var tokens = [ETH,EOS, KNC, OMG, SNT, BAT, ELF, GIFTO, REQ, MANA, POWR,ENG,RDN,SALT,APPC,BQX];
var decimals = [18,18,18,18,18,18,18,5,18,18,6,8,18,8,18,8];

function getName(address) {
  for(var i = 0 ; i < names.length ; i++ ) {
    if(web3.utils.toChecksumAddress(address) == web3.utils.toChecksumAddress(tokens[i])) {
      return names[i];
    }
  }
}

var dictSrc = {};
var dictDest = {};

var firstBlock = 5069586;
var secPerBlock = 15;

networkAddress.getPastEvents('ExecuteTrade',{
  fromBlock: firstBlock,//5069586,
  toBlock : 'latest'}, // 5111343
  function(error, events){
    console.log(events);
    console.log("num txs", events.length);
    for(var i = 0 ; i < events.length ; i++ ) {
      var event = events[i].returnValues;
      var source = event.src;
      var dest = event.dest;
      var srcAmount = event.actualSrcAmount;
      var destAmount = event.actualDestAmount;
      //console.log(events[i].blockNumber);
      var timestamp = (events[i].blockNumber-firstBlock) * secPerBlock;
      var ethVal;
      var factor;
      var symbol;
      if(getName(source) == "ETH") {
        ethVal = srcAmount;
        factor = -1;
        symbol = getName(dest);
      }
      else {
        ethVal = destAmount;
        symbol = getName(source);
        factor = 1;
      }
      //console.log(timestamp,getName(source),"=>",getName(dest),"trade volume",ethVal  / (10**18),"Ether");

      console.log(timestamp + "," + symbol+ "," + factor * ethVal  / (10**18));
      //console.log(source,dest,srcAmount,destAmount);
      if( dictSrc[source] !== undefined ) {
        dictSrc[source] = web3.utils.toBN(dictSrc[source]).add(web3.utils.toBN(srcAmount));
      }
      else {
        dictSrc[source] = web3.utils.toBN(srcAmount);
      }

      if( dictDest[dest] !== undefined ) {
        dictDest[dest] = web3.utils.toBN(dictDest[dest]).add(web3.utils.toBN(destAmount));
      }
      else {
        dictDest[dest] = web3.utils.toBN(web3.utils.toBN(destAmount));
      }
    }

    for( var i = 0 ; i < tokens.length ; i++ ) {
      var address = web3.utils.toChecksumAddress(tokens[i]);
      var dec = decimals[i];
      var name = names[i];
      //console.log(address,i,dictSrc[address],dictDest[address]);

      console.log("token: ", name);
      var inAmount = dictSrc[address];
      var outAmout = dictDest[address];;

      if( inAmount !== undefined ) {
        console.log("in amount: ", (inAmount.div(web3.utils.toBN(10**dec))).toString(10));
      }
      else {
        console.log("in amount: ", 0)
      }

      if( outAmout !== undefined ) {
        console.log("out amount: ", (outAmout.div(web3.utils.toBN(10**dec))).toString(10));
      }
      else {
        console.log("out amount: ", 0)
      }


      console.log("")
    }

    //console.log("src",dictSrc);
    //console.log("dest",dictDest);
  }
);
