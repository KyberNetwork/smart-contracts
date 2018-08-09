const BigNumber = web3.BigNumber

require("chai")
    .use(require("chai-as-promised"))
    .use(require('chai-bignumber')(BigNumber))
    .should()

const SortedLinkedList = artifacts.require("SortedLinkedList");

// let ethAddress = '0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
// let precisionUnits = (new BigNumber(10).pow(18));

contract('SortedLinkedList test', async (accounts) => {

    beforeEach('setup contract for each test', async () => {
        user = accounts[0];
        list = await SortedLinkedList.new();
    });

    it("should have deployed the contract", async () => {
        list.should.exist
    });

    it("should have head in id 1", async () => {
        const headId = await list.HEAD_ID();

        headId.should.be.bignumber.equal(1);
    });

    it("should have tail in id 0", async () => {
        const tailId = await list.TAIL_ID();

        tailId.should.be.bignumber.equal(0);
    });

    it("should add head with tail as nextId", async () => {
        let headId = await list.HEAD_ID();
        let tailId = await list.TAIL_ID();
        let head = await list.getOrderDetails(headId);
        let [maker, srcAmount, dstAmount, prevId, nextId] = head;

        maker.should.be.bignumber.equal(0);
        srcAmount.should.be.bignumber.equal(0);
        dstAmount.should.be.bignumber.equal(0);
        nextId.should.be.bignumber.equal(tailId);
        prevId.should.be.bignumber.equal(0);
    });

    xit("should allow adding new order", async () => {
        let orderId = await list.add(
            10 /*srcAmount*/,
            100 /*dstAmount*/);

        let res = await list.getOrderDetails(0);
        // let [maker, srcAmount, dstAmount, nextId, prevId] = res
        // assert.equal(this.user, maker);
    });

});


function log (string) {
    console.log(string);
};
