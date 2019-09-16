const V5Example = artifacts.require("V5Example.sol");

contract('V5Example', function(accounts) {
  before("setup", async() => {
    //admin account for deployment of contracts
    admin = accounts[0];

    //non-admin account
    operator = accounts[1];
  });

  it("should deploy the V5 contract", async function () {
    v5Example = await V5Example.new({from: admin});
  });

  it("should be able to get variable value from the contract", async function () {
    result = await v5Example.myVariable.call();
    assert.equal(result,5,"variable value not as expected");
  });

  it("should sert variable value correctly", async function () {
    await v5Example.setVariable(10);
    result = await v5Example.myVariable.call();
    assert.equal(result,10,"set variable value not as expected");
  });
});
