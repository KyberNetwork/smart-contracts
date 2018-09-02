#!/usr/bin/env node

const Web3 = require("web3");
const fs = require("fs");
const path = require('path');
const RLP = require('rlp');
const BigNumber = require('bignumber.js')

process.on('unhandledRejection', console.error.bind(console))

const { configPath, gasPriceGwei, printPrivateKey, rpcUrl, signedTxOutput, dontSendTx, chainId: chainIdInput } = require('yargs')
    .usage('Usage: $0 --config-path [path] --gas-price-gwei [gwei] --print-private-key [bool] --rpc-url [url] --signed-tx-output [path] --dont-send-tx [bool] --chain-id')
    .demandOption(['configPath', 'gasPriceGwei', 'rpcUrl'])
    .boolean('printPrivateKey')
    .boolean('dontSendTx')
    .argv;
const web3 = new Web3(new Web3.providers.HttpProvider(rpcUrl));
const solc = require('solc')

const rand = web3.utils.randomHex(7);
const privateKey = web3.utils.sha3("js sucks" + rand);

if (printPrivateKey) {
    console.log("privateKey", privateKey);
    let path = "privatekey_"  + web3.utils.randomHex(7) + ".txt";
    fs.writeFileSync(path, privateKey, function(err) {
        if(err) {
            return console.log(err);
        }
    });
}


const includeSetRatesAndSendTokens = false;

const account = web3.eth.accounts.privateKeyToAccount(privateKey);
const sender = account.address;
const gasPrice = BigNumber(gasPriceGwei).mul(10 ** 9);
const signedTxs = [];
let nonce;
let chainId = chainIdInput;

console.log("from",sender);

async function sendTx(txObject) {
    const txTo = txObject._parent.options.address;

    let gasLimit;
    try {
        gasLimit = await txObject.estimateGas();
    } catch (e) {
        gasLimit = 500 * 1000;
    }

    if(txTo !== null) {
        gasLimit = 500 * 1000;
    }

    //console.log(gasLimit);
    const txData = txObject.encodeABI();
    const txFrom = account.address;
    const txKey = account.privateKey;

    const tx = {
        from : txFrom,
        to : txTo,
        nonce : nonce,
        data : txData,
        gas : gasLimit,
        chainId,
        gasPrice
    };

    const signedTx = await web3.eth.accounts.signTransaction(tx, txKey);
    nonce++;

    // don't wait for confirmation
    signedTxs.push(signedTx.rawTransaction)
    if (!dontSendTx) {
        web3.eth.sendSignedTransaction(signedTx.rawTransaction, {from:sender});
    }
}

async function deployContract(solcOutput, contractName, ctorArgs) {

    const actualName = contractName;
    const bytecode = solcOutput.contracts[actualName].bytecode;

    const abi = solcOutput.contracts[actualName].interface;
    const myContract = new web3.eth.Contract(JSON.parse(abi));
    const deploy = myContract.deploy({data:"0x" + bytecode, arguments: ctorArgs});
    let address = "0x" + web3.utils.sha3(RLP.encode([sender,nonce])).slice(12).substring(14);
    address = web3.utils.toChecksumAddress(address);

    await sendTx(deploy);

    myContract.options.address = address;


    return [address,myContract];
}

const contractPath = path.join(__dirname, "../contracts/");

const input = {
    "ConversionRatesInterface.sol" : fs.readFileSync(contractPath + 'ConversionRatesInterface.sol', 'utf8'),
    "ConversionRates.sol" : fs.readFileSync(contractPath + 'ConversionRates.sol', 'utf8'),
    "PermissionGroups.sol" : fs.readFileSync(contractPath + 'PermissionGroups.sol', 'utf8'),
    "ERC20Interface.sol" : fs.readFileSync(contractPath + 'ERC20Interface.sol', 'utf8'),
    "MockERC20.sol" : fs.readFileSync(contractPath + 'mockContracts/MockERC20.sol', 'utf8'),
    "SanityRatesInterface.sol" : fs.readFileSync(contractPath + 'SanityRatesInterface.sol', 'utf8'),
    "ExpectedRateInterface.sol" : fs.readFileSync(contractPath + 'ExpectedRateInterface.sol', 'utf8'),
    "SanityRates.sol" : fs.readFileSync(contractPath + 'SanityRates.sol', 'utf8'),
    "ExpectedRate.sol" : fs.readFileSync(contractPath + 'ExpectedRate.sol', 'utf8'),
    "Utils.sol" : fs.readFileSync(contractPath + 'Utils.sol', 'utf8'),
    "Utils2.sol" : fs.readFileSync(contractPath + 'Utils2.sol', 'utf8'),
    "FeeBurnerInterface.sol" : fs.readFileSync(contractPath + 'FeeBurnerInterface.sol', 'utf8'),
    "VolumeImbalanceRecorder.sol" : fs.readFileSync(contractPath + 'VolumeImbalanceRecorder.sol', 'utf8'),
    "FeeBurner.sol" : fs.readFileSync(contractPath + 'FeeBurner.sol', 'utf8'),
    "WhiteListInterface.sol" : fs.readFileSync(contractPath + 'WhiteListInterface.sol', 'utf8'),
    "KyberNetwork.sol" : fs.readFileSync(contractPath + 'KyberNetwork.sol', 'utf8'),
    "KyberNetworkInterface.sol" : fs.readFileSync(contractPath + 'KyberNetworkInterface.sol', 'utf8'),
    "SimpleNetworkInterface.sol" : fs.readFileSync(contractPath + 'SimpleNetworkInterface.sol', 'utf8'),
    "KyberNetworkProxyInterface.sol" : fs.readFileSync(contractPath + 'KyberNetworkProxyInterface.sol', 'utf8'),
    "KyberNetworkProxy.sol" : fs.readFileSync(contractPath + 'KyberNetworkProxy.sol', 'utf8'),
    "WhiteList.sol" : fs.readFileSync(contractPath + 'WhiteList.sol', 'utf8'),
    "KyberReserveInterface.sol" : fs.readFileSync(contractPath + 'KyberReserveInterface.sol', 'utf8'),
    "Withdrawable.sol" : fs.readFileSync(contractPath + 'Withdrawable.sol', 'utf8'),
    "KyberReserve.sol" : fs.readFileSync(contractPath + 'KyberReserve.sol', 'utf8'),
    "KyberReserveV1.sol" : fs.readFileSync(contractPath + 'previousContracts/KyberReserveV1.sol', 'utf8'),
    "Wrapper.sol" : fs.readFileSync(contractPath + 'mockContracts/Wrapper.sol', 'utf8')
};

let proxyAddress;
let internalNetworkAddress;
let reserveAddress;
let conversionRatesAddress;
let whitelistAddress;
let feeBurnerAddress;
let expectedRateAddress;
let wrapperAddress;

let proxyContract;
let internalNetworkContract;
let reserveContract;
let conversionRatesContract;
let whitelistContract;
let feeBurnerContract;
let expectedRateContract;
let wrapperContract;

let networkPermissions;
let reservePermissions;
let conversionRatesPermissions;
let whitelistPermissions;
let feeBurnerPermissions;
let expectedRatePermissions;

const depositAddresses = [];
let maxGasPrice = 50 * 1000 * 1000 * 1000;
let negDiffInBps = 15;
let minExpectedRateSlippage = 300;
let kncWallet;
let kncToEthRate = 307;
let validDurationBlock = 24;
let taxWalletAddress = 0x0;
let taxFeesBps = 1000;

let testers;
let testersCat;
let testersCap;
let users;
let usersCat;
let usersCap;
let kgtAddress;

const ethAddress = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

const tokens = [];
const tokenControlInfo = {};
const tokenNameToAddress = { "ETH" : ethAddress };


function parseInput( jsonInput ) {
    // tokens
    const tokenInfo = jsonInput["tokens"];
    Object.keys(tokenInfo).forEach(function(key) {
        const val = tokenInfo[key];
        const symbol = key;
        const name = val["name"];
        const address = val["address"];

        tokenNameToAddress[symbol] = address;

        tokens.push(address);
        const dict = {
            minimalRecordResolution : web3.utils.toBN(val["minimalRecordResolution"]),
            maxPerBlockImbalance : web3.utils.toBN(val["maxPerBlockImbalance"]),
            maxTotalImbalance : web3.utils.toBN(val["maxTotalImbalance"])
        };
        tokenControlInfo[address] = dict;
    });

    // exchanges
    const exchangeInfo = jsonInput["exchanges"];
    Object.keys(exchangeInfo).forEach(function(exchange) {
        Object.keys(exchangeInfo[exchange]).forEach(function(token){
            const depositAddress = exchangeInfo[exchange][token];
            const dict = {};
            dict[token] = depositAddress;
            depositAddresses.push(dict);
        });
    });

    networkPermissions = jsonInput.permission["KyberNetwork"];
    reservePermissions = jsonInput.permission["KyberReserve"];
    conversionRatesPermissions = jsonInput.permission["ConversionRates"];
    whitelistPermissions = jsonInput.permission["WhiteList"];
    feeBurnerPermissions = jsonInput.permission["FeeBurner"];
    expectedRatePermissions = jsonInput.permission["ExpectedRate"];

    maxGasPrice =  web3.utils.toBN(jsonInput["max gas price"]);
    negDiffInBps = web3.utils.toBN(jsonInput["neg diff in bps"]);
    minExpectedRateSlippage = web3.utils.toBN(jsonInput["min expected rate slippage"]);
    kncWallet = jsonInput["KNC wallet"];
    kncToEthRate = web3.utils.toBN(jsonInput["KNC to ETH rate"]);
    taxFeesBps = jsonInput["tax fees bps"];
    taxWalletAddress = jsonInput["tax wallet address"];
    validDurationBlock = web3.utils.toBN(jsonInput["valid duration block"]);
    testers = jsonInput["whitelist params"]["testers"];
    testersCat = jsonInput["whitelist params"]["testers category"];
    testersCap = jsonInput["whitelist params"]["testers cap"];
    users = jsonInput["whitelist params"]["users"];
    usersCat = jsonInput["whitelist params"]["users category"];
    usersCap = jsonInput["whitelist params"]["users cap"];
    kgtAddress = jsonInput["whitelist params"]["KGT address"];


    // output file name
    outputFileName = jsonInput["output filename"];
};

async function setPermissions(contract, permJson) {
    console.log("set operator(s)");
    for(let i = 0 ; i < permJson.operator.length ; i++ ) {
        const operator = permJson.operator[i];
        console.log(operator);
        await sendTx(contract.methods.addOperator(operator));
    }

    console.log("set alerter(s)");
    for(let i = 0 ; i < permJson.alerter.length ; i++ ) {
        const alerter = permJson.alerter[i];
        console.log(alerter);
        await sendTx(contract.methods.addAlerter(alerter));
    }

    console.log("transferAdminQuickly");
    const admin = permJson.admin;
    console.log(admin);
    await sendTx(contract.methods.transferAdminQuickly(admin));
}


async function main() {
    nonce = await web3.eth.getTransactionCount(sender);
    console.log("nonce",nonce);

    chainId = chainId || await web3.eth.net.getId()
    console.log('chainId', chainId);

    console.log("starting compilation");
    const output = await solc.compile({ sources: input }, 1);
    //console.log(output);
    console.log("finished compilation");

    if (!dontSendTx) {
        await waitForEth();
    }


    console.log("deploying kyber network");
    [proxyAddress, proxyContract] = await deployContract(output, "KyberNetworkProxy.sol:KyberNetworkProxy", [sender]);
    console.log("deploying kyber network");
    [internalNetworkAddress,internalNetworkContract] = await deployContract(output, "KyberNetwork.sol:KyberNetwork", [sender]);
    console.log("deploying conversion rates");
    [conversionRatesAddress,conversionRatesContract] = await deployContract(output, "ConversionRates.sol:ConversionRates", [sender]);
    console.log("deploying kyber reserve");
    [reserveAddress,reserveContract] = await deployContract(output, "KyberReserve.sol:KyberReserve", [internalNetworkAddress,conversionRatesAddress,sender]);
    console.log("deploying fee burner");
    [feeBurnerAddress, feeBurnerContract] = await deployContract(output, "FeeBurner.sol:FeeBurner", [sender,"0xdd974D5C2e2928deA5F71b9825b8b646686BD200",internalNetworkAddress]);
    console.log("deploying whitelist");
    [whitelistAddress, whitelistContract] = await deployContract(output, "WhiteList.sol:WhiteList", [sender, kgtAddress]);
    console.log("deploying expected rates");
    [expectedRateAddress, expectedRateContract] = await deployContract(output, "ExpectedRate.sol:ExpectedRate", [internalNetworkAddress,sender]);
    console.log("deploying wrapper");
    [wrapperAddress, wrapperContract] = await deployContract(output, "Wrapper.sol:Wrapper", [internalNetworkAddress,sender]);

    console.log("internal network", internalNetworkAddress);
    console.log("proxy", proxyAddress);
    console.log("rates", conversionRatesAddress);
    console.log("reserve", reserveAddress);
    console.log("feeBurner", feeBurnerAddress);
    console.log("whitelistAddress", whitelistAddress);
    console.log("expectedRateAddress", expectedRateAddress);
    console.log("wrapperAddress", wrapperAddress);

    //set network in proxy
    console.log("set network in proxy");
    await sendTx(proxyContract.methods.setKyberNetworkContract(internalNetworkAddress));

    setPermissions(proxyContract, networkPermissions);

    // add reserve to network
    console.log("Add reserve to network");
    //console.log(internalNetworkContract.methods.addReserve(reserveAddress,true));
    await sendTx(internalNetworkContract.methods.addReserve(reserveAddress,true));

    console.log("add temp operator to set info data");
    await sendTx(internalNetworkContract.methods.addOperator(sender));


    // list tokens
    const abi = output.contracts["MockERC20.sol:MockERC20"].interface;
    const jsonForERC20 = JSON.parse(abi);

    for( i = 0 ; i < tokens.length ; i++ ) {
        console.log("listing eth <--> ", tokens[i]);
        await sendTx(internalNetworkContract.methods.listPairForReserve(reserveAddress,
                                                                tokens[i],
                                                                true,
                                                                true,
                                                                true));

        const srcString1 = web3.utils.sha3("src token " + (2*i).toString());
        const destString1 = web3.utils.sha3("dest token " + (2*i).toString());
        const srcString2 = web3.utils.sha3("src token " + (2*i + 1).toString());
        const destString2 = web3.utils.sha3("dest token " + (2*i + 1).toString());

        await sendTx(internalNetworkContract.methods.setInfo(srcString1, ethAddress));
        await sendTx(internalNetworkContract.methods.setInfo(destString1, tokens[i]));
        await sendTx(internalNetworkContract.methods.setInfo(srcString2, tokens[i]));
        await sendTx(internalNetworkContract.methods.setInfo(destString2, ethAddress));


        //this will work if sender has tokens...
        if (includeSetRatesAndSendTokens == true) {
            try{
                let token = await new web3.eth.Contract(jsonForERC20, tokens[i]);
                console.log("try to send tokens to reserve from sender");
                await sendTx(token.methods.transfer(reserveAddress, 10**22));
                await sendTx(token.methods.transfer(reserveAddress, 10**22));
            } catch(e) {

            }
        }
    }

    console.log("set num listed pairs info");
    const numListPairsString = web3.utils.sha3("num listed pairs");
    await sendTx(internalNetworkContract.methods.setInfo(numListPairsString,tokens.length * 2));
    console.log("delete temp operator to set info data");
    await sendTx(internalNetworkContract.methods.removeOperator(sender));

    // set params
    console.log("network set params");
    await sendTx(internalNetworkContract.methods.setParams(maxGasPrice,
                                                 negDiffInBps));

    console.log("network set white list");
    await sendTx(internalNetworkContract.methods.setWhiteList(whitelistAddress));
    console.log("network set expected rate");
    await sendTx(internalNetworkContract.methods.setExpectedRate(expectedRateAddress));
    console.log("network set fee burner");
    await sendTx(internalNetworkContract.methods.setFeeBurner(feeBurnerAddress));
    console.log("network set proxy address");
    await sendTx(internalNetworkContract.methods.setKyberProxy(proxyAddress));

    console.log("network enable");
    await sendTx(internalNetworkContract.methods.setEnable(true));

    // add operator
    console.log("network set permissioned addresses");
    await setPermissions(internalNetworkContract, networkPermissions);

    // reserve
    console.log("reserve approve withdraw addresses");
    for( i = 0 ; i < depositAddresses.length ; i++ ) {
        const dict = depositAddresses[i];
        const tokenSymbol = Object.keys(dict)[0];
        const tokenAddress = tokenNameToAddress[tokenSymbol];
        const depositAddress = dict[tokenSymbol];
        console.log(tokenSymbol,tokenAddress,depositAddress);
        await sendTx(reserveContract.methods.approveWithdrawAddress(tokenAddress,
                                                                    depositAddress,
                                                                    true));
    }
    await setPermissions(reserveContract, reservePermissions);

    // expected rates
    console.log("expected rate - add temp operator");
    await sendTx(expectedRateContract.methods.addOperator(sender));
    console.log("expected rate - set slippage to 3%");
    await sendTx(expectedRateContract.methods.setWorstCaseRateFactor(minExpectedRateSlippage));
    console.log("expected rate - set qty factor to 1");
    await sendTx(expectedRateContract.methods.setQuantityFactor(1));
    console.log("expected rate - remove temp operator");
    await sendTx(expectedRateContract.methods.removeOperator(sender));

    await setPermissions(expectedRateContract, expectedRatePermissions);


    // whitelist
    console.log("white list - add temp operator to set sgd rate");
    await sendTx(whitelistContract.methods.addOperator(sender));
    console.log("white list - set sgd rate");
    await sendTx(whitelistContract.methods.setSgdToEthRate(web3.utils.toBN("645161290322581")));
    console.log("white list - init users list");
    for(let i = 0 ; i < users.length ; i++ ) {
        console.log(users[i]);
        await sendTx(whitelistContract.methods.setUserCategory(users[i],usersCat));
    }

    console.log("white list - set cat cap");
    await sendTx(whitelistContract.methods.setCategoryCap(usersCat, usersCap));
    console.log("white list - init tester list");
    for(let i = 0 ; i < testers.length ; i++ ) {
        console.log(testers[i]);
        await sendTx(whitelistContract.methods.setUserCategory(testers[i],testersCat));
    }

    console.log("white list - set cat cap");
    await sendTx(whitelistContract.methods.setCategoryCap(testersCat, testersCap));
    console.log("white list - remove temp opeator to set sgd rate");
    await sendTx(whitelistContract.methods.removeOperator(sender));

    await setPermissions(whitelistContract, whitelistPermissions);

    // burn fee
    console.log("burn fee - set reserve data");
    await sendTx(feeBurnerContract.methods.setReserveData(reserveAddress,
                                                        25,
                                                        kncWallet));
    console.log("set KNC to ETH rate");
    await sendTx(feeBurnerContract.methods.setKNCRate(kncToEthRate));
    console.log("set tax fees bps");
    await sendTx(feeBurnerContract.methods.setTaxInBps(taxFeesBps));
    if(taxWalletAddress != '' && taxWalletAddress != 0) {
        console.log("set wallet address");
        await sendTx(feeBurnerContract.methods.setTaxWallet(taxWalletAddress));
    }

    await setPermissions(feeBurnerContract, feeBurnerPermissions);

    // conversion rates
    console.log("conversion rate - add token");
    for( let i = 0 ; i < tokens.length ; i++ ) {
        console.log(tokens[i]);
        await sendTx(conversionRatesContract.methods.addToken(tokens[i]));
    }

    console.log("conversion rate - set valid duration block");
    await sendTx(conversionRatesContract.methods.setValidRateDurationInBlocks(validDurationBlock));
    console.log("conversion rate - setReserveAddress");
    await sendTx(conversionRatesContract.methods.setReserveAddress(reserveAddress));

    console.log("conversion rate - set control info");
    for( let i = 0 ; i < tokens.length ; i++ ) {
        console.log(tokens[i]);
        const dict = tokenControlInfo[tokens[i]];
        await sendTx(conversionRatesContract.methods.setTokenControlInfo(tokens[i],
                                                                         dict.minimalRecordResolution,
                                                                         dict.maxPerBlockImbalance,
                                                                         dict.maxTotalImbalance));
    }

    console.log("conversion rate - enable token trade");
    for( let i = 0 ; i < tokens.length ; i++ ) {
        console.log(tokens[i]);
        const dict = tokenControlInfo[tokens[i]];
        await sendTx(conversionRatesContract.methods.enableTokenTrade(tokens[i]));
    }


    console.log("conversion rate - add temp operator");
    await sendTx(conversionRatesContract.methods.addOperator(sender));
    console.log("conversion rate - set qty step function to 0");
    for( let i = 0 ; i < tokens.length ; i++ ) {
        console.log(tokens[i]);
        await sendTx(conversionRatesContract.methods.setQtyStepFunction(tokens[i],
                                                                    [0],
                                                                    [0],
                                                                    [0],
                                                                    [0]));
    }
    console.log("conversion rate - set imbalance step function to 0");
    for( let i = 0 ; i < tokens.length ; i++ ) {
        console.log(tokens[i]);
        await sendTx(conversionRatesContract.methods.setImbalanceStepFunction(tokens[i],
                                                                    [0],
                                                                    [0],
                                                                    [0],
                                                                    [0]));
    }

    //set some rates. for test network deploy
    if (includeSetRatesAndSendTokens == true) {
        console.log("conversion rate, set rates per token");
        for( let i = 0 ; i < tokens.length ; i++ ) {
            console.log(tokens[i]);
            ethToTokenRate = (new BigNumber(10).pow(18)).div((i + 1) * 5).floor();
            tokenToEthRate = (new BigNumber(10).pow(18)).mul((i + 1) * 5).floor();
            console.log(ethToTokenRate.valueOf())

            baseBuy.push(ethToTokenRate);
            baseSell.push(tokenToEthRate);
        }

        let bytes14 = '0x0000000000000000000000000000';
        await sendTx(rates.methods.setBaseRate(tokens, baseBuy, baseSell, [bytes14], [bytes14], 8104090, [0]));
    }

    console.log("conversion rate - remove temp operator");
    await sendTx(conversionRatesContract.methods.removeOperator(sender));

    await setPermissions(conversionRatesContract, conversionRatesPermissions);

    console.log("last nonce is", nonce);

    printParams(JSON.parse(content));
    const signedTxsJson = JSON.stringify({ from: sender, txs: signedTxs }, null, 2);
    if (signedTxOutput) {
        fs.writeFileSync(signedTxOutput, signedTxsJson);
    }
}

function printParams(jsonInput) {
    dictOutput = {};
    dictOutput["tokens"] = jsonInput.tokens;
    dictOutput["tokens"]["ETH"] = {"name" : "Ethereum", "decimals" : 18, "address" : ethAddress };
    dictOutput["exchanges"] = jsonInput.exchanges;
    dictOutput["permission"] = jsonInput.permission;
    dictOutput["whitelist params"] = jsonInput["whitelist params"];
    dictOutput["max gas price"] = jsonInput["max gas price"];
    dictOutput["neg diff in bps"] = jsonInput["neg diff in bps"];
    dictOutput["min expected rate slippage"] = jsonInput["min expected rate slippage"];
    dictOutput["KNC wallet"] = kncWallet;
    dictOutput["KNC to ETH rate"] = jsonInput["KNC to ETH rate"];
    dictOutput["tax wallet address"] = jsonInput["tax wallet address"];
    dictOutput["tax fees bps"] = jsonInput["tax fees bps"];
    dictOutput["valid duration block"] = jsonInput["valid duration block"];
    dictOutput["reserve"] = reserveAddress;
    dictOutput["pricing"] = conversionRatesAddress;
    dictOutput["internal network"] = internalNetworkAddress;
    dictOutput["network"] = proxyAddress;
    dictOutput["wrapper"] = wrapperAddress;
    dictOutput["feeburner"] = feeBurnerAddress;
    const json = JSON.stringify(dictOutput, null, 2);
    console.log(json);
    const outputFileName = jsonInput["output filename"];
    console.log(outputFileName, 'write');
    fs.writeFileSync(outputFileName, json);
}


function sleep(ms){
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
}

async function waitForEth() {
    while(true) {
        const balance = await web3.eth.getBalance(sender);
        console.log("waiting for balance to account " + sender);
        if(balance.toString() !== "0") {
            console.log("received " + balance.toString() + " wei");
            return;
        }
        else await sleep(10000)
    }
}


let filename;
let content;

try{
    content = fs.readFileSync(configPath, 'utf8');
    //console.log(content.substring(2892,2900));
    //console.log(content.substring(3490,3550));
    parseInput(JSON.parse(content));
}
catch(err) {
    console.log(err);
    process.exit(-1)
}

main();

//console.log(deployContract(output, "cont",5));
