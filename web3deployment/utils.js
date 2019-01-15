const fs = require('fs');

let ouputLogString = "";
let ouputErrString = "";
let addressesToNames = {};


module.exports.myLog = function myLog(error, highlight, string) {
    if (error) {
//        console.error(string);
        console.log('\x1b[31m%s\x1b[0m', string);
        ouputErrString += "\nerror: " + string;
        ouputLogString += "\nerror: " + string;
    } else if (highlight) {
        console.log('\x1b[33m%s\x1b[0m', string);
        ouputErrString += "\nwarning: " + string;
        ouputLogString += "\nwarning: " + string;
    } else {
        console.log('\x1b[32m%s\x1b[0m', string);
        ouputLogString += "\n     " + string;
    }
};

//write log ouputs
module.exports.writeLogs = function writeLogs(deployInputJsonPath) {

    let fileName = deployInputJsonPath + ".log";
    module.exports.myLog(0, 1, "write output log to: " + fileName);

    fs.writeFileSync(fileName, ouputLogString, function(err) {
        if(err) {
            console.log(err);
        } else {
            module.exports.myLog(0, 1, "saved log to: " + fileName);
        }
    });



    fileName = deployInputJsonPath + ".err";
    module.exports.myLog(0, 1, "write error log to: " + fileName);

    fs.writeFileSync(fileName, ouputErrString, function(err) {
        if(err) {
            console.log(err);
        } else {
            module.exports.myLog(0, 1, "saved error file to: " + fileName);
        }
    });
}

//address to name
module.exports.a2n = async function a2n(address, showAddWithName, isToken, solcOutput) {
    let name;
    try {
        name = addressesToNames[address.toLowerCase()];
        if (name == undefined) {
            if (isToken == true) {
                let abi = solcOutput.contracts["MockERC20.sol:MockERC20"].interface;
                let ERC20 = await new web3.eth.Contract(JSON.parse(abi), address);
                try {
                    name = await ERC20.methods.symbol().call();
                    if (name != undefined) {
                        addressesToNames[address.toLowerCase()] = name;
                        if (showAddWithName) name += " " + address.toLowerCase();
                    }
                } catch(e) {}
            }
            if (name == undefined) {
                name = address;
            }
        } else if (showAddWithName) {
            name += " " + address.toLowerCase();
        }
    } catch(e) {
     name = address;
    }

    return name;
}

//address to name
module.exports.addName2Add = function setName(address, name) {
    addressesToNames[address] = name;
}

module.exports.getNameFromAdd = function getName(address) {
    return addressesToNames[address];
}
