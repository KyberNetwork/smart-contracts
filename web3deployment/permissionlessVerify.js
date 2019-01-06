
const utils = require("./utils.js");
const myLog = utils.myLog;
const a2n = utils.a2n;
const addName2Add = utils.addName2Add;
const getNameFromAdd = utils.getNameFromAdd;


module.exports.readPermisionlessOrderbookLister = async function (listerAddress, solcOutput, jsonNetworkAdd) {
    if(listerAddress == 0) return;

    let abi = solcOutput.contracts["PermissionlessOrderbookReserveLister.sol:PermissionlessOrderbookReserveLister"].interface;
    let Lister = await new web3.eth.Contract(JSON.parse(abi), listerAddress);

    //verify binary as expected.
    let blockCode = await web3.eth.getCode(listerAddress);
    let solcCode = '0x' + (solcOutput.contracts["PermissionlessOrderbookReserveLister.sol:PermissionlessOrderbookReserveLister"].runtimeBytecode);

    myLog(0, 0, (""));
    myLog(0, 0, ("Permissionless orderbook reserve lister. Address: " + listerAddress));
    myLog(0, 0, ("------------------------------------------------------------"));

    if (blockCode != solcCode){
        myLog(1, 0, "blockchain Code:");
        myLog(0, 0, blockCode);
        myLog(1, 0, 'solc code');
        myLog(0, 0, solcCode);
        myLog(1, 0, "Byte code from block chain doesn't match locally compiled code.")
        myLog(0, 0, '')
    } else {
        myLog(0, 0, "Code on blockchain matches locally compiled code");
        myLog(0, 0, '');
    }

    //read addresses and create contract instances.
    myLog(0, 1, "permissionless reserves list")

    let listingEvents = await Lister.getPastEvents("TokenOrderbookListingStage", {fromBlock: 0, toBlock: 'latest'});
    let tokenListingStageDict = [];

    //find last listing event per token
    for(let i = 0; i < listingEvents.length; i++) {
       let token = listingEvents[i].returnValues.token;
       tokenListingStageDict[token] = listingEvents[i].returnValues.stage.valueOf();
    };

    for(let token in tokenListingStageDict) {
        myLog(0, 0, "Token: " + (await a2n(token, 1, true, solcOutput)) + " listing stage: " + tokenListingStageDict[token]);
    }

    let minNewOrderUsd = await Lister.methods.minNewOrderValueUsd().call();
    myLog(0, 0, "minNewOrderValueUsd: " + minNewOrderUsd.valueOf());

    let maxOrdersPerTrade = await Lister.methods.maxOrdersPerTrade().call();
    myLog(0, (maxOrdersPerTrade.valueOf() > 5), "maxOrdersPerTrade " + maxOrdersPerTrade.valueOf());

    let medianizerContract = await Lister.methods.medianizerContract().call();
    myLog((medianizerContract.valueOf() == 0), 0, "medianizerContract: " + medianizerContract.valueOf());

    let kyberNetworkContract = (await Lister.methods.kyberNetworkContract().call()).toLowerCase();
    myLog((kyberNetworkContract.valueOf() != jsonNetworkAdd), 0, "kyberNetworkContract: " + kyberNetworkContract);

    let orderFactoryContract = await Lister.methods.orderFactoryContract().call();
    myLog(0, 0, "orderFactoryContract " + orderFactoryContract);
}

module.exports.readOrderbookReserve = async function (reserveAddress, solcOutput, jsonFeeBurnerAdd, jsonNetworkAdd) {
    let abi = solcOutput.contracts["OrderbookReserve.sol:OrderbookReserve"].interface;
    let Reserve = await new web3.eth.Contract(JSON.parse(abi), reserveAddress);

    //verify binary as expected.
    let blockCode = await web3.eth.getCode(reserveAddress);
    let solcCode = '0x' + (solcOutput.contracts["OrderbookReserve.sol:OrderbookReserve"].runtimeBytecode);

    myLog(0, 0, (""));
    myLog(0, 0, ("Orderbook reserve Address: " + reserveAddress));
    myLog(0, 0, ("------------------------------------------------------------"));

    if (blockCode != solcCode){
//        myLog(1, 0, "blockchain Code:");
//        myLog(0, 0, blockCode);
        myLog(0, 0, '');
        myLog(1, 0, "Byte code from block chain doesn't match locally compiled code.")
        myLog(0, 0, '')
        return;
    } else {
        myLog(0, 0, "Code on blockchain matches locally compiled code");
        myLog(0, 0, '');
    }

    let orderLimits = await Reserve.methods.limits().call();
    myLog(0, 0, "minNewOrderSizeUsd " + orderLimits[0].valueOf());
    myLog(0, 0, "maxOrdersPerTrade " + orderLimits[1].valueOf());
    myLog(0, 0, "minNewOrderSizeWei " + orderLimits[2].valueOf() + " == " + getAmountTokens(orderLimits[2].valueOf(), 18) + " tokens");
    myLog(0, 0, "minOrderSizeWei " + orderLimits[3].valueOf() + " == " + getAmountTokens(orderLimits[3].valueOf(), 18) + " tokens");

    let kncPerEthBaseRatePrecision = await Reserve.methods.kncPerEthBaseRatePrecision().call();
    myLog(0, 0, "kncPerEthBaseRatePrecision " + kncPerEthBaseRatePrecision.valueOf() + " == " + getAmountTokens(kncPerEthBaseRatePrecision.valueOf(), 18) + " tokens.");

    let contracts = await Reserve.methods.contracts().call();
    myLog(0, 0, "token " + (await a2n(contracts[0].valueOf(), 1)));
    myLog(0, 0, "kncToken " + (await a2n(contracts[1].valueOf(), 1)));
    myLog(0, (contracts[2].valueOf().toLowerCase()  != jsonFeeBurnerAdd), "feeBurner " + contracts[2].valueOf());
    myLog(0, (contracts[3].valueOf().toLowerCase() != jsonNetworkAdd), "kyberNetwork " + contracts[3].valueOf());
    myLog(0, 0, "medianizer " + contracts[4].valueOf());
    myLog(0, 0, "orderListFactory " + contracts[5].valueOf());

    let depositKncEvents = await Reserve.getPastEvents("KncFeeDeposited", {fromBlock: 0, toBlock: 'latest'});
    let makersDictKncAmount = [];

    for(let i = 0; i < depositKncEvents.length; i++) {
        let maker = depositKncEvents[i].returnValues.maker;
        if(makersDictKncAmount[maker] == undefined) makersDictKncAmount[maker] = web3.utils.toBN(0);
        makersDictKncAmount[maker] = (web3.utils.toBN(depositKncEvents[i].returnValues.amount)).add(makersDictKncAmount[maker]);
    };

    for(let maker in makersDictKncAmount) {
        myLog(0, 0, "Maker: " + maker + ": Knc deposited:  " + getAmountTokens(makersDictKncAmount[maker].valueOf(), 18));
    }
}


function stageIdToName(stage) {
    switch (stage) {
        case 0: return "none"; break;
        case 1: return "deployed"; break;
        case 2: return "init"; break;
        case 3: return "listed & ready"; break;
    };
}

function getAmountTokens(amountTwei, digits) {
//    myLog(0, 0, "decimals " + digits + "amountTwei " + amountTwei)
    let stringAmount = amountTwei.toString(10);
    let integer = stringAmount.substring(0,stringAmount.length - digits);
//    myLog(0, 0, "integer " + integer)
    let fraction = stringAmount.substring(stringAmount.length - digits);
    if( fraction.length < digits) {
        fraction = web3.utils.toBN(10).pow(web3.utils.toBN(fraction.length - digits)).toString(10).substring(1) + fraction;
    }

    fraction = fraction.replace(/0+$/,'');
    fraction = fraction.slice(0, 4); //enough 4 decimals.
    if (fraction == '') fraction = '0';
    if (integer == '') integer = '0';

    return integer + "." + fraction;
};

function weiToEth(wei) {
    myLog(1, 1, "wei " + wei)
    myLog(1, 1, "wei " + wei)
    myLog(1, 1, "wei " + wei)
    let weiNum = web3.utils.toBN(wei);
    return (weiNum.div(10 ** 18)).valueOf();
}
