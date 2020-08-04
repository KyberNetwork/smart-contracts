const ethers = require('ethers');
const BN = ethers.BigNumber;
const NETWORK = "mainnet";
const PROJECT_ID = ""
const provider = new ethers.providers.getDefaultProvider(NETWORK, {infura: PROJECT_ID});
// const provider = new ethers.providers.InfuraProvider(NETWORK, PROJECT_ID);
const fs = require("fs");
const RESERVE_TYPES = {
    "FPR": 1,
    "APR": 2,
    "BRIDGE": 3,
    "UTILITY": 4,
    "CUSTOM": 5,
    "ORDERBOOK": 6
}

const gasStation = require('../helpers/gasStation');

const Storage_ABI = [{"inputs":[{"internalType":"address","name":"_admin","type":"address"},{"internalType":"contract IKyberHistory","name":"_kyberNetworkHistory","type":"address"},{"internalType":"contract IKyberHistory","name":"_kyberFeeHandlerHistory","type":"address"},{"internalType":"contract IKyberHistory","name":"_kyberDaoHistory","type":"address"},{"internalType":"contract IKyberHistory","name":"_kyberMatchingEngineHistory","type":"address"}],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"reserve","type":"address"},{"indexed":true,"internalType":"bytes32","name":"reserveId","type":"bytes32"},{"indexed":false,"internalType":"enum IKyberStorage.ReserveType","name":"reserveType","type":"uint8"},{"indexed":true,"internalType":"address","name":"rebateWallet","type":"address"}],"name":"AddReserveToStorage","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"newAdmin","type":"address"},{"indexed":false,"internalType":"address","name":"previousAdmin","type":"address"}],"name":"AdminClaimed","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"newAlerter","type":"address"},{"indexed":false,"internalType":"bool","name":"isAdd","type":"bool"}],"name":"AlerterAdded","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"contract IKyberNetwork","name":"newKyberNetwork","type":"address"}],"name":"KyberNetworkUpdated","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"bytes32","name":"reserveId","type":"bytes32"},{"indexed":false,"internalType":"address","name":"reserve","type":"address"},{"indexed":true,"internalType":"contract IERC20","name":"src","type":"address"},{"indexed":true,"internalType":"contract IERC20","name":"dest","type":"address"},{"indexed":false,"internalType":"bool","name":"add","type":"bool"}],"name":"ListReservePairs","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"newOperator","type":"address"},{"indexed":false,"internalType":"bool","name":"isAdd","type":"bool"}],"name":"OperatorAdded","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"reserve","type":"address"},{"indexed":true,"internalType":"bytes32","name":"reserveId","type":"bytes32"}],"name":"RemoveReserveFromStorage","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"bytes32","name":"reserveId","type":"bytes32"},{"indexed":true,"internalType":"address","name":"rebateWallet","type":"address"}],"name":"ReserveRebateWalletSet","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"pendingAdmin","type":"address"}],"name":"TransferAdminPending","type":"event"},{"inputs":[{"internalType":"address","name":"newAlerter","type":"address"}],"name":"addAlerter","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"kyberProxy","type":"address"},{"internalType":"uint256","name":"maxApprovedProxies","type":"uint256"}],"name":"addKyberProxy","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"newOperator","type":"address"}],"name":"addOperator","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"reserve","type":"address"},{"internalType":"bytes32","name":"reserveId","type":"bytes32"},{"internalType":"enum IKyberStorage.ReserveType","name":"resType","type":"uint8"},{"internalType":"address payable","name":"rebateWallet","type":"address"}],"name":"addReserve","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"admin","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"claimAdmin","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"getAlerters","outputs":[{"internalType":"address[]","name":"","type":"address[]"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"getContracts","outputs":[{"internalType":"address[]","name":"kyberDaoAddresses","type":"address[]"},{"internalType":"address[]","name":"kyberFeeHandlerAddresses","type":"address[]"},{"internalType":"address[]","name":"kyberMatchingEngineAddresses","type":"address[]"},{"internalType":"address[]","name":"kyberNetworkAddresses","type":"address[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"bytes32[]","name":"reserveIds","type":"bytes32[]"}],"name":"getEntitledRebateData","outputs":[{"internalType":"bool[]","name":"entitledRebateArr","type":"bool[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"bytes32[]","name":"reserveIds","type":"bytes32[]"}],"name":"getFeeAccountedData","outputs":[{"internalType":"bool[]","name":"feeAccountedArr","type":"bool[]"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"getKyberProxies","outputs":[{"internalType":"contract IKyberNetworkProxy[]","name":"","type":"address[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"bytes32","name":"reserveId","type":"bytes32"}],"name":"getListedTokensByReserveId","outputs":[{"internalType":"contract IERC20[]","name":"srcTokens","type":"address[]"},{"internalType":"contract IERC20[]","name":"destTokens","type":"address[]"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"getOperators","outputs":[{"internalType":"address[]","name":"","type":"address[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"bytes32[]","name":"reserveIds","type":"bytes32[]"}],"name":"getRebateWalletsFromIds","outputs":[{"internalType":"address[]","name":"rebateWallets","type":"address[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"bytes32","name":"reserveId","type":"bytes32"}],"name":"getReserveAddressesByReserveId","outputs":[{"internalType":"address[]","name":"reserveAddresses","type":"address[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"bytes32[]","name":"reserveIds","type":"bytes32[]"}],"name":"getReserveAddressesFromIds","outputs":[{"internalType":"address[]","name":"reserveAddresses","type":"address[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"contract IERC20","name":"token","type":"address"},{"internalType":"uint256","name":"startIndex","type":"uint256"},{"internalType":"uint256","name":"endIndex","type":"uint256"}],"name":"getReserveAddressesPerTokenSrc","outputs":[{"internalType":"address[]","name":"reserveAddresses","type":"address[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"reserve","type":"address"}],"name":"getReserveDetailsByAddress","outputs":[{"internalType":"bytes32","name":"reserveId","type":"bytes32"},{"internalType":"address","name":"rebateWallet","type":"address"},{"internalType":"enum IKyberStorage.ReserveType","name":"resType","type":"uint8"},{"internalType":"bool","name":"isFeeAccountedFlag","type":"bool"},{"internalType":"bool","name":"isEntitledRebateFlag","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"bytes32","name":"reserveId","type":"bytes32"}],"name":"getReserveDetailsById","outputs":[{"internalType":"address","name":"reserveAddress","type":"address"},{"internalType":"address","name":"rebateWallet","type":"address"},{"internalType":"enum IKyberStorage.ReserveType","name":"resType","type":"uint8"},{"internalType":"bool","name":"isFeeAccountedFlag","type":"bool"},{"internalType":"bool","name":"isEntitledRebateFlag","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"reserve","type":"address"}],"name":"getReserveId","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address[]","name":"reserveAddresses","type":"address[]"}],"name":"getReserveIdsFromAddresses","outputs":[{"internalType":"bytes32[]","name":"reserveIds","type":"bytes32[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"contract IERC20","name":"token","type":"address"}],"name":"getReserveIdsPerTokenDest","outputs":[{"internalType":"bytes32[]","name":"reserveIds","type":"bytes32[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"contract IERC20","name":"token","type":"address"}],"name":"getReserveIdsPerTokenSrc","outputs":[{"internalType":"bytes32[]","name":"reserveIds","type":"bytes32[]"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"getReserves","outputs":[{"internalType":"contract IKyberReserve[]","name":"","type":"address[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"bytes32[]","name":"reserveIds","type":"bytes32[]"},{"internalType":"contract IERC20","name":"src","type":"address"},{"internalType":"contract IERC20","name":"dest","type":"address"}],"name":"getReservesData","outputs":[{"internalType":"bool","name":"areAllReservesListed","type":"bool"},{"internalType":"bool[]","name":"feeAccountedArr","type":"bool[]"},{"internalType":"bool[]","name":"entitledRebateArr","type":"bool[]"},{"internalType":"contract IKyberReserve[]","name":"reserveAddresses","type":"address[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"enum IKyberStorage.ReserveType","name":"resType","type":"uint8"}],"name":"getReservesPerType","outputs":[{"internalType":"bytes32[]","name":"","type":"bytes32[]"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"isKyberProxyAdded","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"kyberDaoHistory","outputs":[{"internalType":"contract IKyberHistory","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"kyberFeeHandlerHistory","outputs":[{"internalType":"contract IKyberHistory","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"kyberMatchingEngineHistory","outputs":[{"internalType":"contract IKyberHistory","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"kyberNetwork","outputs":[{"internalType":"contract IKyberNetwork","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"kyberNetworkHistory","outputs":[{"internalType":"contract IKyberHistory","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"bytes32","name":"reserveId","type":"bytes32"},{"internalType":"contract IERC20","name":"token","type":"address"},{"internalType":"bool","name":"ethToToken","type":"bool"},{"internalType":"bool","name":"tokenToEth","type":"bool"},{"internalType":"bool","name":"add","type":"bool"}],"name":"listPairForReserve","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"pendingAdmin","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"alerter","type":"address"}],"name":"removeAlerter","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"kyberProxy","type":"address"}],"name":"removeKyberProxy","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"operator","type":"address"}],"name":"removeOperator","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"bytes32","name":"reserveId","type":"bytes32"},{"internalType":"uint256","name":"startIndex","type":"uint256"}],"name":"removeReserve","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_kyberFeeHandler","type":"address"},{"internalType":"address","name":"_kyberMatchingEngine","type":"address"}],"name":"setContracts","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"bool","name":"fpr","type":"bool"},{"internalType":"bool","name":"apr","type":"bool"},{"internalType":"bool","name":"bridge","type":"bool"},{"internalType":"bool","name":"utility","type":"bool"},{"internalType":"bool","name":"custom","type":"bool"},{"internalType":"bool","name":"orderbook","type":"bool"}],"name":"setEntitledRebatePerReserveType","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"bool","name":"fpr","type":"bool"},{"internalType":"bool","name":"apr","type":"bool"},{"internalType":"bool","name":"bridge","type":"bool"},{"internalType":"bool","name":"utility","type":"bool"},{"internalType":"bool","name":"custom","type":"bool"},{"internalType":"bool","name":"orderbook","type":"bool"}],"name":"setFeeAccountedPerReserveType","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_kyberDao","type":"address"}],"name":"setKyberDaoContract","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"contract IKyberNetwork","name":"_kyberNetwork","type":"address"}],"name":"setNetworkContract","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"bytes32","name":"reserveId","type":"bytes32"},{"internalType":"address","name":"rebateWallet","type":"address"}],"name":"setRebateWallet","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"newAdmin","type":"address"}],"name":"transferAdmin","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"newAdmin","type":"address"}],"name":"transferAdminQuickly","outputs":[],"stateMutability":"nonpayable","type":"function"}];

const KyberReserve_ABI = [{"constant":false,"inputs":[],"name":"enableTrade","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"alerter","type":"address"}],"name":"removeAlerter","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"token","type":"address"},{"name":"wallet","type":"address"}],"name":"setTokenWallet","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"pendingAdmin","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"getOperators","outputs":[{"name":"","type":"address[]"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"token","type":"address"},{"name":"amount","type":"uint256"},{"name":"sendTo","type":"address"}],"name":"withdrawToken","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"newAlerter","type":"address"}],"name":"addAlerter","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"sanityRatesContract","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"token","type":"address"},{"name":"addr","type":"address"},{"name":"approve","type":"bool"}],"name":"approveWithdrawAddress","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"token","type":"address"},{"name":"amount","type":"uint256"},{"name":"destination","type":"address"}],"name":"withdraw","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[],"name":"disableTrade","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"srcToken","type":"address"},{"name":"srcAmount","type":"uint256"},{"name":"destToken","type":"address"},{"name":"destAddress","type":"address"},{"name":"conversionRate","type":"uint256"},{"name":"validate","type":"bool"}],"name":"trade","outputs":[{"name":"","type":"bool"}],"payable":true,"stateMutability":"payable","type":"function"},{"constant":false,"inputs":[{"name":"newAdmin","type":"address"}],"name":"transferAdmin","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[],"name":"claimAdmin","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"newAdmin","type":"address"}],"name":"transferAdminQuickly","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"getAlerters","outputs":[{"name":"","type":"address[]"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"src","type":"address"},{"name":"dest","type":"address"},{"name":"srcQty","type":"uint256"},{"name":"blockNumber","type":"uint256"}],"name":"getConversionRate","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"newOperator","type":"address"}],"name":"addOperator","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"src","type":"address"},{"name":"dest","type":"address"},{"name":"dstQty","type":"uint256"},{"name":"rate","type":"uint256"}],"name":"getSrcQty","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"","type":"address"}],"name":"tokenWallet","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"operator","type":"address"}],"name":"removeOperator","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"_kyberNetwork","type":"address"},{"name":"_conversionRates","type":"address"},{"name":"_sanityRates","type":"address"}],"name":"setContracts","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"kyberNetwork","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"amount","type":"uint256"},{"name":"sendTo","type":"address"}],"name":"withdrawEther","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"conversionRatesContract","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"tradeEnabled","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"","type":"bytes32"}],"name":"approvedWithdrawAddresses","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"admin","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"token","type":"address"}],"name":"getBalance","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"name":"src","type":"address"},{"name":"dest","type":"address"},{"name":"srcQty","type":"uint256"},{"name":"rate","type":"uint256"}],"name":"getDestQty","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"inputs":[{"name":"_kyberNetwork","type":"address"},{"name":"_ratesContract","type":"address"},{"name":"_admin","type":"address"}],"payable":false,"stateMutability":"nonpayable","type":"constructor"},{"payable":true,"stateMutability":"payable","type":"fallback"},{"anonymous":false,"inputs":[{"indexed":false,"name":"token","type":"address"},{"indexed":false,"name":"amount","type":"uint256"}],"name":"DepositToken","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"origin","type":"address"},{"indexed":false,"name":"src","type":"address"},{"indexed":false,"name":"srcAmount","type":"uint256"},{"indexed":false,"name":"destToken","type":"address"},{"indexed":false,"name":"destAmount","type":"uint256"},{"indexed":false,"name":"destAddress","type":"address"}],"name":"TradeExecute","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"enable","type":"bool"}],"name":"TradeEnabled","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"token","type":"address"},{"indexed":false,"name":"addr","type":"address"},{"indexed":false,"name":"approve","type":"bool"}],"name":"WithdrawAddressApproved","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"token","type":"address"},{"indexed":false,"name":"wallet","type":"address"}],"name":"NewTokenWallet","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"token","type":"address"},{"indexed":false,"name":"amount","type":"uint256"},{"indexed":false,"name":"destination","type":"address"}],"name":"WithdrawFunds","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"network","type":"address"},{"indexed":false,"name":"rate","type":"address"},{"indexed":false,"name":"sanity","type":"address"}],"name":"SetContractAddresses","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"token","type":"address"},{"indexed":false,"name":"amount","type":"uint256"},{"indexed":false,"name":"sendTo","type":"address"}],"name":"TokenWithdraw","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"amount","type":"uint256"},{"indexed":false,"name":"sendTo","type":"address"}],"name":"EtherWithdraw","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"pendingAdmin","type":"address"}],"name":"TransferAdminPending","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"newAdmin","type":"address"},{"indexed":false,"name":"previousAdmin","type":"address"}],"name":"AdminClaimed","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"newAlerter","type":"address"},{"indexed":false,"name":"isAdd","type":"bool"}],"name":"AlerterAdded","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"newOperator","type":"address"},{"indexed":false,"name":"isAdd","type":"bool"}],"name":"OperatorAdded","type":"event"}];

// THINGS TO CHANGE
const jsonFileName = 'reserves.json';
const STORAGE_ADDRESS = "";
const NEW_NETWORK_ADDRESS = "";
const STORAGE_OPERATOR_PK = "";
let NONCE; // = BN.from(123);
let GAS_PRICE; // = ethers.utils.parseUnits('48', 'gwei');

const STORAGE_SIGNER = new ethers.Wallet(STORAGE_OPERATOR_PK, provider);

const Storage = new ethers.Contract(
    STORAGE_ADDRESS,
    Storage_ABI,
    STORAGE_SIGNER
);

async function main() {
    // check that storage signer is operator
    let operators = await Storage.getOperators();
    if (operators.indexOf(STORAGE_SIGNER.address) == -1) {
        console.log('Error: Signer not operator of storage contract');
        process.exit(0);
    }

    NONCE = (NONCE == undefined) ? BN.from(await STORAGE_SIGNER.getTransactionCount()) : NONCE;

    // read reserves on staging network
    content = fs.readFileSync(jsonFileName, 'utf8');
    let reservesInfo = JSON.parse(content);
    while (reservesInfo.length > 0) {
        // get all reserves on storage, converted to lowercase
        let storageReserves = await Storage.getReserves();
        let tempResArray = storageReserves.join(`~`).toLowerCase();
        storageReserves = tempResArray.split(`~`);

        for (let i = 0; i < reservesInfo.length; i++) {
            let reserveInfo = reservesInfo[i];
            while (reserveInfo.id.length != 66) {
                reserveInfo.id = reserveInfo.id + '0';
            }

            let reserveInstance = new ethers.Contract(
                reserveInfo.address,
                KyberReserve_ABI,
                provider
            );

            let networkPointer = await reserveInstance.kyberNetwork();
            if (networkPointer.toLowerCase() == NEW_NETWORK_ADDRESS.toLowerCase()) {
                // first, add reserve if not added
                // if (storageReserves.indexOf(reserveInfo.address.toLowerCase()) == -1) {
                //     console.log(`Adding reserve: ${reserveInfo.address}`);
                //     console.log(`Tx nonce: ${NONCE.toString()}`);
                //     await Storage.addReserve(
                //         reserveInfo.address,
                //         reserveInfo.id,
                //         RESERVE_TYPES[reserveInfo.type],
                //         reserveInfo.rebateWallet,
                //         (GAS_PRICE == undefined) ? {nonce: NONCE} : {nonce: NONCE, gasPrice: GAS_PRICE}
                //     );
                //     NONCE = NONCE.add(BN.from(1));
                //     await pressToContinue();
                //     console.log(`\n`);
                // };

                // list tokens of reserve
                while (reserveInfo.tokens.length > 0) {
                    let token = reserveInfo.tokens.shift();
                    console.log(`Listing ${token.address} for reserve ${reserveInfo.name}`);
                    console.log(`Tx nonce: ${NONCE.toString()}`);
                    let data = await gasStation.getGasData();
                    GAS_PRICE = (BN.from(data.fast).add(BN.from(2))).mul(BN.from(10).pow(BN.from(8)));
                    console.log(`gas price: ${data.fast/10} gwei`);
                    await Storage.listPairForReserve(
                        reserveInfo.id,
                        token.address,
                        token.ethToToken,
                        token.tokenToEth,
                        true,
                        {nonce: NONCE, gasPrice: GAS_PRICE}
                    );
                    NONCE = NONCE.add(BN.from(1));
                    await pressToContinue();
                    console.log(`\n`);

                    if (reserveInfo.tokens.length == 0) {
                        // remove reserveInfo from reservesInfo array
                        reservesInfo.shift();
                    }

                    // export reservesInfo after each delisting
                    const exportReservesInfoJSON = JSON.stringify(reservesInfo, null, 2);
                    fs.writeFileSync(`unmigratedReserves.json`, exportReservesInfoJSON);
                    console.log(`Exported new state. If stopping script, don't forget to remove ${STORAGE_SIGNER.address} as operator!`);
                }
            }
        }
        console.log("Looped through reserves. Waiting for more reserves to point to new network...");
        await sleep(20000);
    }
    console.log(`All reserves have been listed! Don't forget to remove ${STORAGE_SIGNER.address} as operator!`);
    process.exit(0);
}

async function pressToContinue() {
    console.log("Press any key to continue!");
    await keypress();
}

const keypress = async () => {
    process.stdin.setRawMode(true)
    return new Promise(resolve => process.stdin.once('data', data => {
      const byteArray = [...data]
      if (byteArray.length > 0 && byteArray[0] === 3) {
        console.log('^C')
        process.exit(1)
      }
      process.stdin.setRawMode(false)
      resolve()
    }))
}

function sleep(ms){
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
