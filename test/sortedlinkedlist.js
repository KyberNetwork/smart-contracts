const BigNumber = web3.BigNumber

require("chai")
    .use(require("chai-as-promised"))
    .use(require('chai-bignumber')(BigNumber))
    .should()

let Helper = require("./helper.js");

const SortedLinkedList = artifacts.require("SortedLinkedList");

contract('SortedLinkedList test', async (accounts) => {

    beforeEach('setup contract for each test', async () => {
        user1 = accounts[0];
        user2 = accounts[1];
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

    it("head should initially point to tail as its nextId", async () => {
        let head = await getOrderById(await list.HEAD_ID());

        head.nextId.should.be.bignumber.equal(await list.TAIL_ID());
    });

    it("should add order with unique id", async () => {
        let orderId = await list.add.call(
            10 /* srcAmount */,
            100 /* dstAmount */);

        orderId.should.be.bignumber.not.equal(await list.HEAD_ID());
        orderId.should.be.bignumber.not.equal(await list.TAIL_ID());
    });

    it("should add order and get its data back with user as maker", async () => {
        let order = await addOrder(10 /* srcAmount */, 100 /* dstAmount */);

        order.maker.should.equal(user1);
        order.srcAmount.should.be.bignumber.equal(10);
        order.dstAmount.should.be.bignumber.equal(100);
    });

    it("should add single order so that head is its prev and tail is its next", async () => {
        let order = await addOrder(10 /* srcAmount */, 100 /* dstAmount */);

        order.prevId.should.be.bignumber.equal(await list.HEAD_ID());
        order.nextId.should.be.bignumber.equal(await list.TAIL_ID());
    });

    it("should add two orders and get the data back with users as makers", async () => {
        let order1 = await addOrder(
            10 /* srcAmount */,
            100 /* dstAmount */,
            {from: user1}
        );
        let order2 = await addOrder(
            10 /* srcAmount */,
            200 /* dstAmount */,
            {from: user2}
        );

        order1.maker.should.equal(user1);
        order1.srcAmount.should.be.bignumber.equal(10);
        order1.dstAmount.should.be.bignumber.equal(100);
        order2.maker.should.equal(user2);
        order2.srcAmount.should.be.bignumber.equal(10);
        order2.dstAmount.should.be.bignumber.equal(200);
    });

    it("should add two orders so that -> head <-> first <-> second <-> tail", async () => {
        let id1 = await addOrderGetId(10 /* srcAmount */, 200 /* dstAmount */);
        let id2 = await addOrderGetId(10 /* srcAmount */, 100 /* dstAmount */);

        let head = await getOrderById(await list.HEAD_ID());
        let order1 = await getOrderById(id1)
        let order2 = await getOrderById(id2)
        // head -> 1 -> 2 -> tail
        head.nextId.should.be.bignumber.equal(order1.id);
        order1.nextId.should.be.bignumber.equal(order2.id);
        order2.nextId.should.be.bignumber.equal(await list.TAIL_ID());
        // head <- 1 <- 2
        order2.prevId.should.be.bignumber.equal(order1.id);
        order1.prevId.should.be.bignumber.equal(head.id);
    });

    it("should add orders according to sorting algorithm", async () => {
        let worseId = await addOrderGetId(
            10 /* srcAmount */,
            100 /* dstAmount */
        );
        let betterId = await addOrderGetId(
            10 /* srcAmount */,
            200 /* dstAmount */
        );

        let head = await getOrderById(await list.HEAD_ID());
        let worse = await getOrderById(worseId);
        let better = await getOrderById(betterId);
        // head -> better -> worse -> tail
        head.nextId.should.be.bignumber.equal(better.id);
        better.nextId.should.be.bignumber.equal(worse.id);
        worse.nextId.should.be.bignumber.equal(await list.TAIL_ID());
        // head <- better <- worse
        worse.prevId.should.be.bignumber.equal(better.id);
        better.prevId.should.be.bignumber.equal(head.id);
    });

    it("should calculate order sort key", async () => {
        worse = await list.calculateOrderSortKey(
            10 /* srcAmount */,
            100 /* dstAmount */
        );
        better = await list.calculateOrderSortKey(
            10 /* srcAmount */,
            200 /* dstAmount */
        );

        better.should.be.bignumber.greaterThan(worse);
    });

    it("find order prev in empty list", async () => {
        let srcAmount = 10;
        let dstAmount = 100;
        let prevId = await list.findPrevOrderId(srcAmount, dstAmount);

        prevId.should.be.bignumber.equal(await list.HEAD_ID());
    });

    it("find order prev in list with one better order", async () => {
        let betterId = await addOrderGetId(
            10 /* srcAmount */,
            200 /* dstAmount */
        );

        let srcAmount = 10;
        let dstAmount = 100;
        let prevId = await list.findPrevOrderId(srcAmount, dstAmount);

        prevId.should.be.bignumber.equal(betterId);
    });

    it("find order prev in list with one worse order", async () => {
        let worseId = await addOrderGetId(
            10 /* srcAmount */,
            100 /* dstAmount */
        );

        let srcAmount = 10;
        let dstAmount = 200;
        let prevId = await list.findPrevOrderId(srcAmount, dstAmount);

        prevId.should.be.bignumber.equal(await list.HEAD_ID());
    });

    it("find order prev in list with a worse order and a better one", async () => {
        let betterId = await addOrderGetId(
            10 /* srcAmount */,
            300 /* dstAmount */
        );
        let worseId = await addOrderGetId(
            10 /* srcAmount */,
            100 /* dstAmount */
        );

        let srcAmount = 10;
        let dstAmount = 200;
        let prevId = await list.findPrevOrderId(srcAmount, dstAmount);

        prevId.should.be.bignumber.equal(betterId);
    });

    it("add order to an empty list", async () => {
        let srcAmount = 10;
        let dstAmount = 100;
        let order = await addOrder(srcAmount, dstAmount);

        let head = await getOrderById(await list.HEAD_ID());
        head.nextId.should.be.bignumber.equal(order.id);
        order.nextId.should.be.bignumber.equal(await list.TAIL_ID());
        order.prevId.should.be.bignumber.equal(await list.HEAD_ID());
    });

    it("add order to list with one better order", async () => {
        let betterId = await addOrderGetId(
            10 /* srcAmount */,
            200 /* dstAmount */
        );

        let srcAmount = 10;
        let dstAmount = 100;
        let order = await addOrder(srcAmount, dstAmount);

        let head = await getOrderById(await list.HEAD_ID());
        let better = await getOrderById(betterId);
        // head -> better -> order -> tail
        head.nextId.should.be.bignumber.equal(better.id);
        better.nextId.should.be.bignumber.equal(order.id);
        order.nextId.should.be.bignumber.equal(await list.TAIL_ID());
        // head <- better <- order
        order.prevId.should.be.bignumber.equal(better.id);
        better.prevId.should.be.bignumber.equal(await list.HEAD_ID());
    });

    it("add order to list with one worse order", async () => {
        let worseId = await addOrderGetId(
            10 /* srcAmount */,
            100 /* dstAmount */
        );

        let srcAmount = 10;
        let dstAmount = 200;
        let order = await addOrder(srcAmount, dstAmount);

        let head = await getOrderById(await list.HEAD_ID());
        let worse = await getOrderById(worseId);
        // head -> order -> worse -> tail
        head.nextId.should.be.bignumber.equal(order.id);
        order.nextId.should.be.bignumber.equal(worse.id);
        worse.nextId.should.be.bignumber.equal(await list.TAIL_ID());
        // head <- order <- worse
        worse.prevId.should.be.bignumber.equal(order.id);
        order.prevId.should.be.bignumber.equal(await list.HEAD_ID());
    });

    it("add order to list with a worse order and a better one", async () => {
        let worseId = await addOrderGetId(
            10 /* srcAmount */,
            100 /* dstAmount */
        );
        let betterId = await addOrderGetId(
            10 /* srcAmount */,
            300 /* dstAmount */
        );

        let srcAmount = 10;
        let dstAmount = 200;
        let order = await addOrder(srcAmount, dstAmount);

        let head = await getOrderById(await list.HEAD_ID());
        let better = await getOrderById(betterId);
        let worse = await getOrderById(worseId);
        // head -> better -> order -> worse -> tail
        head.nextId.should.be.bignumber.equal(better.id);
        better.nextId.should.be.bignumber.equal(order.id);
        order.nextId.should.be.bignumber.equal(worse.id);
        worse.nextId.should.be.bignumber.equal(await list.TAIL_ID());
        // head <- better <- order <- worse
        worse.prevId.should.be.bignumber.equal(order.id);
        order.prevId.should.be.bignumber.equal(better.id);
        better.prevId.should.be.bignumber.equal(await list.HEAD_ID());
    });

    it("add order after a specified order id", async () => {
        let worseId = await addOrderGetId(
            10 /* srcAmount */,
            100 /* dstAmount */
        );
        let betterId = await addOrderGetId(
            10 /* srcAmount */,
            300 /* dstAmount */
        );

        let srcAmount = 10;
        let dstAmount = 200;
        let order = await addOrderAfterId(srcAmount, dstAmount, betterId);

        let head = await getOrderById(await list.HEAD_ID());
        let better = await getOrderById(betterId);
        let worse = await getOrderById(worseId);
        // head -> better -> order -> worse -> tail
        head.nextId.should.be.bignumber.equal(better.id);
        better.nextId.should.be.bignumber.equal(order.id);
        order.nextId.should.be.bignumber.equal(worse.id);
        worse.nextId.should.be.bignumber.equal(await list.TAIL_ID());
        // head <- better <- order <- worse
        worse.prevId.should.be.bignumber.equal(order.id);
        order.prevId.should.be.bignumber.equal(better.id);
        better.prevId.should.be.bignumber.equal(await list.HEAD_ID());
    });

    it("should reject adding after invalid order id: non-existant", async () => {
        // Calling locally so that the order will not be in fact added to the
        // list and thus the id will be invalid.
        let nonExistantPrevId = await list.add.call(
            10 /* srcAmount */,
            100 /* dstAmount */
        );

        try {
            let order = await addOrderAfterId(
                10 /* srcAmount */,
                200 /* dstAmount */,
                nonExistantPrevId
            );
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(
                Helper.isRevertErrorMessage(e),
                "expected revert but got: " + e);
        }
    });

    it("should reject adding after invalid order id: is TAIL", async () => {
        try {
            let order = await addOrderAfterId(
                10 /* srcAmount */,
                200 /* dstAmount */,
                // TAIL is technically a non-existant order, as the ID used for
                // it should not have an order in it, but the verification was
                // added to make this requirement explicit.
                await list.TAIL_ID()
            );
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(
                Helper.isRevertErrorMessage(e),
                "expected revert but got: " + e);
        }
    });

    it("should reject adding after invalid order id: bad ordering", async () => {
        let worseId = await addOrderGetId(
            10 /* srcAmount */,
            100 /* dstAmount */
        );

        try {
            let order = await addOrderAfterId(
                10 /* srcAmount */,
                100 /* dstAmount */,
                worseId);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(
                Helper.isRevertErrorMessage(e),
                "expected revert but got: " + e);
        }
    });

    // TODO: Add an order as one user and check make from another user
    // TODO: Do not allow removing / updating HEAD
    // TODO: Only allow maker or admin to remove / update order

});

class Order {
    constructor(id, maker, srcAmount, dstAmount, prevId, nextId) {
        this.id = id;
        this.maker = maker;
        this.srcAmount = srcAmount;
        this.dstAmount = dstAmount;
        this.prevId = prevId;
        this.nextId = nextId;
    }
}

async function getOrderById(id) {
    let params = await list.getOrderDetails(id);
    let [maker, srcAmount, dstAmount, prevId, nextId] = params;
    return new Order(id, maker, srcAmount, dstAmount, prevId, nextId);
}

async function addOrderGetId(srcAmount, dstAmount, args = {}) {
    // "Calling" the contract's add function does not return the id value so
    // we first run add.call() to perform the action without changing the state
    // of the blockchain, then actually running add to make the changes.
    let orderId = await list.add.call(srcAmount, dstAmount, args);
    await list.add(srcAmount, dstAmount, args);
    return orderId;
}

async function addOrderAfterIdGetId(srcAmount, dstAmount, prevId, args = {}) {
    // "Calling" the contract's add function does not return the id value so
    // we first run add.call() to perform the action without changing the state
    // of the blockchain, then actually running add to make the changes.
    let orderId = await list.addAfterId.call(
        srcAmount, dstAmount, prevId, args);
    await list.addAfterId(srcAmount, dstAmount, prevId, args);
    return orderId;
}

async function addOrder(srcAmount, dstAmount, args = {}) {
    let orderId = await addOrderGetId(srcAmount, dstAmount, args);
    return await getOrderById(orderId);
}

async function addOrderAfterId(srcAmount, dstAmount, prevId, args = {}) {
    let orderId = await addOrderAfterIdGetId(
            srcAmount, dstAmount, prevId, args);
    return await getOrderById(orderId);
}
