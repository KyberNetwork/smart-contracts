const Helper = require("./helper.js");
const V5Example = artifacts.require("V5Example.sol");

let admin;

contract('V5Example', function(accounts) {
    before("setup", async() => {
        // admin account for deployment of contracts
        admin = accounts[0];
    });

    it("should deploy the V5 contract", async function () {
        let v5Example = await V5Example.new({from: admin});
    });

    it("should be able to get variable value from the contract", async function () {
        let result = await v5Example.myVariable.call();
        assert.equal(result, 5, "variable value not as expected");
    });

    it("should set variable value correctly", async function () {
        await v5Example.setVariable(10);
        let result = await v5Example.myVariable.call();
        assert.equal(result, 10, "set variable value not as expected");
    });

    describe("Tests fail to showcase stack traces", async function () {
        it("calling non-payable function with ETH", async function () {
            await v5Example.setVariable(10, {value: 123});
        });

        it("sends ETH to contract without payable fallback function", async function () {
            await Helper.sendEtherWithPromise(accounts[8], v5Example.address, 1234);
        });

        it("shows revert message", async function () {
            await v5Example.variableMustBeFive();
        });
    });
});
