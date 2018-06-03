const Web3 = require('web3');

const networkABI =
[{"constant":false,"inputs":[{"name":"alerter","type":"address"}],"name":"removeAlerter","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"reserve","type":"address"},{"name":"src","type":"address"},{"name":"dest","type":"address"},{"name":"add","type":"bool"}],"name":"listPairForReserve","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"","type":"address"},{"name":"","type":"bytes32"}],"name":"perReserveListedPairs","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"getReserves","outputs":[{"name":"","type":"address[]"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"enabled","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"pendingAdmin","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"getOperators","outputs":[{"name":"","type":"address[]"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"token","type":"address"},{"name":"amount","type":"uint256"},{"name":"sendTo","type":"address"}],"name":"withdrawToken","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"maxGasPrice","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"newAlerter","type":"address"}],"name":"addAlerter","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"negligibleRateDiff","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"feeBurnerContract","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"expectedRateContract","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"whiteListContract","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"field","type":"bytes32"},{"name":"value","type":"uint256"}],"name":"setInfo","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"user","type":"address"}],"name":"getUserCapInWei","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"newAdmin","type":"address"}],"name":"transferAdmin","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"_enable","type":"bool"}],"name":"setEnable","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[],"name":"claimAdmin","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"","type":"address"}],"name":"isReserve","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"newAdmin","type":"address"}],"name":"transferAdminQuickly","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"getAlerters","outputs":[{"name":"","type":"address[]"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"src","type":"address"},{"name":"dest","type":"address"},{"name":"srcQty","type":"uint256"}],"name":"getExpectedRate","outputs":[{"name":"expectedRate","type":"uint256"},{"name":"slippageRate","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"","type":"uint256"}],"name":"reserves","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"newOperator","type":"address"}],"name":"addOperator","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"reserve","type":"address"},{"name":"add","type":"bool"}],"name":"addReserve","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"operator","type":"address"}],"name":"removeOperator","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"_whiteList","type":"address"},{"name":"_expectedRate","type":"address"},{"name":"_feeBurner","type":"address"},{"name":"_maxGasPrice","type":"uint256"},{"name":"_negligibleRateDiff","type":"uint256"}],"name":"setParams","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"","type":"bytes32"}],"name":"info","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"src","type":"address"},{"name":"dest","type":"address"},{"name":"srcQty","type":"uint256"}],"name":"findBestRate","outputs":[{"name":"","type":"uint256"},{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"src","type":"address"},{"name":"srcAmount","type":"uint256"},{"name":"dest","type":"address"},{"name":"destAddress","type":"address"},{"name":"maxDestAmount","type":"uint256"},{"name":"minConversionRate","type":"uint256"},{"name":"walletId","type":"address"}],"name":"trade","outputs":[{"name":"","type":"uint256"}],"payable":true,"stateMutability":"payable","type":"function"},{"constant":false,"inputs":[{"name":"amount","type":"uint256"},{"name":"sendTo","type":"address"}],"name":"withdrawEther","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"getNumReserves","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"token","type":"address"},{"name":"user","type":"address"}],"name":"getBalance","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"admin","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"inputs":[{"name":"_admin","type":"address"}],"payable":false,"stateMutability":"nonpayable","type":"constructor"},{"payable":true,"stateMutability":"payable","type":"fallback"},{"anonymous":false,"inputs":[{"indexed":true,"name":"sender","type":"address"},{"indexed":false,"name":"amount","type":"uint256"}],"name":"EtherReceival","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"sender","type":"address"},{"indexed":false,"name":"src","type":"address"},{"indexed":false,"name":"dest","type":"address"},{"indexed":false,"name":"actualSrcAmount","type":"uint256"},{"indexed":false,"name":"actualDestAmount","type":"uint256"}],"name":"ExecuteTrade","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"reserve","type":"address"},{"indexed":false,"name":"add","type":"bool"}],"name":"AddReserveToNetwork","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"reserve","type":"address"},{"indexed":false,"name":"src","type":"address"},{"indexed":false,"name":"dest","type":"address"},{"indexed":false,"name":"add","type":"bool"}],"name":"ListReservePairs","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"token","type":"address"},{"indexed":false,"name":"amount","type":"uint256"},{"indexed":false,"name":"sendTo","type":"address"}],"name":"TokenWithdraw","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"amount","type":"uint256"},{"indexed":false,"name":"sendTo","type":"address"}],"name":"EtherWithdraw","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"pendingAdmin","type":"address"}],"name":"TransferAdminPending","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"newAdmin","type":"address"},{"indexed":false,"name":"previousAdmin","type":"address"}],"name":"AdminClaimed","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"newAlerter","type":"address"},{"indexed":false,"name":"isAdd","type":"bool"}],"name":"AlerterAdded","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"newOperator","type":"address"},{"indexed":false,"name":"isAdd","type":"bool"}],"name":"OperatorAdded","type":"event"}];


//const url = "https://mainnet.infura.io";
const url = 'https://semi-node.kyber.network';

const web3 = new Web3(new Web3.providers.HttpProvider(url));
const networkAddress = "0x964F35fAe36d75B1e72770e244F6595B68508CF5";
const networkInst = new web3.eth.Contract(networkABI, networkAddress);


const firstBlock = 5175652;
const firstBlockPerDay = [5175652, 5181470, 5187439, 5193364, 5199281, 5205125, 5211027, 5216920, 5222808, 5228705, 5234554, 5246390]

main();

async function main () {

    console.log("fetch events");

    let events = await networkInst.getPastEvents('ExecuteTrade',{
        fromBlock: firstBlock,
        toBlock : 'latest'});

    await processEvents(events);
}

async function processEvents(events){
//        console.log(events);

    let newAddressToday = [];
    let addressesSoFar = {};
    const secondsPerDay = 60 * 60 * 24;
    const secondPerBlock = 14.6;

    console.log("num txs", events.length);

    let day = 1;
    uniqueAddressToday = 0;
    newAddressToday = 0;
    let uniqueToday = {};
    let numTradesToday = 0;
    let numEthersToday = 0;
    let numSmallTrades = 0;
    let wei;
    let block = await web3.eth.getBlock(firstBlock, true);
    let lastDayTimeStamp = block.timestamp;
    let isBlockInNewDay = false;
    let firstBlockToday = firstBlock;
    let endDayBlock;

    console.log("day\ttrades\t< 0.1\tuinque\tnew\tEthers\tETH-Avg\tBlock\t\tstart");

    for(i = 0 ; i < events.length ; i++ ) {

        if (day < firstBlockPerDay.length) {
            if (events[i].blockNumber > firstBlockPerDay[day]) {
                isBlockInNewDay = true;
                endDayBlock = firstBlockPerDay[day];
            }
        } else if (events[i].blockNumber > nextDayGuessFirstBlock) {
            isBlockInNewDay = true;
            endDayBlock = nextDayGuessFirstBlock.toFixed(0);
        }

        if (i == events.length - 1)
            isBlockInNewDay = true;

        if(isBlockInNewDay) {
            nextDayGuessFirstBlock = (events[i].blockNumber * 1) + (secondsPerDay / secondPerBlock);

            //new day
            uniqueToday = {};
            console.log("%d\t%d\t%d\t%d\t%d\t%d\t%d\t%d\t\t%s",
                day, numTradesToday, numSmallTrades, uniqueAddressToday, newAddressToday,
                numEthersToday.toFixed(2), (numEthersToday / numTradesToday).toFixed(2), firstBlockToday,
                await dateTimeFromBlock(firstBlockToday));

            firstBlockToday = endDayBlock;
            uniqueAddressToday = 0;
            newAddressToday = 0;
            numTradesToday = 0;
            numEthersToday = 0;
            day++;
            numSmallTrades = 0;
            isBlockInNewDay = false;
        }


        let event = events[i].returnValues;

        let userAddress = event.sender;

        //process data
        numTradesToday++;

        //calc ether amount
        if (event.src == '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') {
            //buy
            wei = web3.utils.toBN(event.actualSrcAmount);
        } else {
            wei = web3.utils.toBN(event.actualDestAmount);
        }

        let ethers = wei.div(web3.utils.toBN(10).pow(web3.utils.toBN(15)));
        ethers = ethers / 1000;

        numEthersToday += 1 * ethers.valueOf();

        if(ethers.valueOf() < 0.1) {
            numSmallTrades++;
        }

        if (addressesSoFar[userAddress] != 1) {
            newAddressToday++;
            addressesSoFar[userAddress] = 1;
//                console.log(userAddress);
        }

        if(uniqueToday[userAddress] != 1) {
            uniqueAddressToday++;
            uniqueToday[userAddress] = 1;
        }
    }
}

async function dateTimeFromBlock(blockNumber) {
    let block = await web3.eth.getBlock(blockNumber, true);

    if (block != null) {
        return (new Date(block.timestamp * 1000).toGMTString());
    }
}
