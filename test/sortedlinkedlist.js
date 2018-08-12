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

    it("should return order maker from a different user", async () => {
        let orderId = await addOrderGetId(
            10 /* srcAmount */,
            100 /* dstAmount */,
            {from: user1}
        );

        let params = await list.getOrderDetails(orderId, {from: user2});
        let [maker,,,,] = params;

        maker.should.equal(user1);
    });

    it("should add two orders so that -> HEAD <-> first <-> second <-> TAIL", async () => {
        let id1 = await addOrderGetId(10 /* srcAmount */, 200 /* dstAmount */);
        let id2 = await addOrderGetId(10 /* srcAmount */, 100 /* dstAmount */);

        let head = await getOrderById(await list.HEAD_ID());
        let order1 = await getOrderById(id1)
        let order2 = await getOrderById(id2)
        // HEAD -> 1 -> 2 -> TAIL
        head.nextId.should.be.bignumber.equal(order1.id);
        order1.nextId.should.be.bignumber.equal(order2.id);
        order2.nextId.should.be.bignumber.equal(await list.TAIL_ID());
        // HEAD <- 1 <- 2
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
        // HEAD -> better -> worse -> TAIL
        head.nextId.should.be.bignumber.equal(better.id);
        better.nextId.should.be.bignumber.equal(worse.id);
        worse.nextId.should.be.bignumber.equal(await list.TAIL_ID());
        // HEAD <- better <- worse
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

    it("add order to list after better order", async () => {
        let betterId = await addOrderGetId(
            10 /* srcAmount */,
            200 /* dstAmount */
        );

        let srcAmount = 10;
        let dstAmount = 100;
        let order = await addOrder(srcAmount, dstAmount);

        let head = await getOrderById(await list.HEAD_ID());
        let better = await getOrderById(betterId);
        // HEAD -> better -> order -> TAIL
        head.nextId.should.be.bignumber.equal(better.id);
        better.nextId.should.be.bignumber.equal(order.id);
        order.nextId.should.be.bignumber.equal(await list.TAIL_ID());
        // HEAD <- better <- order
        order.prevId.should.be.bignumber.equal(better.id);
        better.prevId.should.be.bignumber.equal(await list.HEAD_ID());
    });

    it("add order to list before worse order", async () => {
        let worseId = await addOrderGetId(
            10 /* srcAmount */,
            100 /* dstAmount */
        );

        let srcAmount = 10;
        let dstAmount = 200;
        let order = await addOrder(srcAmount, dstAmount);

        let head = await getOrderById(await list.HEAD_ID());
        let worse = await getOrderById(worseId);
        // HEAD -> order -> worse -> TAIL
        head.nextId.should.be.bignumber.equal(order.id);
        order.nextId.should.be.bignumber.equal(worse.id);
        worse.nextId.should.be.bignumber.equal(await list.TAIL_ID());
        // HEAD <- order <- worse
        worse.prevId.should.be.bignumber.equal(order.id);
        order.prevId.should.be.bignumber.equal(await list.HEAD_ID());
    });

    it("add order to list between better and worse ones", async () => {
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
        // HEAD -> better -> order -> worse -> TAIL
        head.nextId.should.be.bignumber.equal(better.id);
        better.nextId.should.be.bignumber.equal(order.id);
        order.nextId.should.be.bignumber.equal(worse.id);
        worse.nextId.should.be.bignumber.equal(await list.TAIL_ID());
        // HEAD <- better <- order <- worse
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
        // HEAD -> better -> order -> worse -> TAIL
        head.nextId.should.be.bignumber.equal(better.id);
        better.nextId.should.be.bignumber.equal(order.id);
        order.nextId.should.be.bignumber.equal(worse.id);
        worse.nextId.should.be.bignumber.equal(await list.TAIL_ID());
        // HEAD <- better <- order <- worse
        worse.prevId.should.be.bignumber.equal(order.id);
        order.prevId.should.be.bignumber.equal(better.id);
        better.prevId.should.be.bignumber.equal(await list.HEAD_ID());
    });

    it("should reject adding after invalid order id: non-existant", async () => {
        // Calling locally so that the order will not be in fact added to the
        // list and thus the id will be invalid.
        let nonExistantOrderId = await list.add.call(
            10 /* srcAmount */,
            100 /* dstAmount */
        );

        try {
            let order = await addOrderAfterId(
                10 /* srcAmount */,
                200 /* dstAmount */,
                nonExistantOrderId
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

    it("remove order deletes it from list", async () => {
        let orderId = await addOrderGetId(
            10 /* srcAmount */,
            100 /* dstAmount */);

        await list.removeById(orderId);

        // Order no longer in list
        let order = await getOrderById(orderId);
        order.maker.should.be.bignumber.equal(0);
        order.srcAmount.should.be.bignumber.equal(0);
        order.dstAmount.should.be.bignumber.equal(0);
        order.prevId.should.be.bignumber.equal(0);
        order.nextId.should.be.bignumber.equal(0);
    });

    it("removing all orders from list: starting with highest", async () => {
        let worseId = await addOrderGetId(
            10 /* srcAmount */,
            100 /* dstAmount */);
        let betterId = await addOrderGetId(
            10 /* srcAmount */,
            200 /* dstAmount */);

        await list.removeById(worseId);
        await list.removeById(betterId);

        // Removed from linked list
        let head = await getOrderById(await list.HEAD_ID());
        head.nextId.should.be.bignumber.equal(await list.TAIL_ID());
    });

    it("remove all orders from list: starting with lowest", async () => {
        let worseId = await addOrderGetId(
            10 /* srcAmount */,
            100 /* dstAmount */);
        let betterId = await addOrderGetId(
            10 /* srcAmount */,
            200 /* dstAmount */);

        await list.removeById(betterId);
        await list.removeById(worseId);

        // Removed from linked list
        let head = await getOrderById(await list.HEAD_ID());
        head.nextId.should.be.bignumber.equal(await list.TAIL_ID());
    });

    it("remove order from list maintains order: last order", async () => {
        let worseId = await addOrderGetId(
            10 /* srcAmount */,
            100 /* dstAmount */);
        let betterId = await addOrderGetId(
            10 /* srcAmount */,
            200 /* dstAmount */);

        await list.removeById(worseId);

        // Removed from linked list
        let head = await getOrderById(await list.HEAD_ID());
        let better = await getOrderById(betterId);
        // HEAD -> better -> TAIL
        head.nextId.should.be.bignumber.equal(better.id);
        better.nextId.should.be.bignumber.equal(await list.TAIL_ID());
        // HEAD <- better
        better.prevId.should.be.bignumber.equal(head.id);
    });

    it("remove order from list maintains order: first order", async () => {
        let worseId = await addOrderGetId(
            10 /* srcAmount */,
            100 /* dstAmount */);
        let betterId = await addOrderGetId(
            10 /* srcAmount */,
            200 /* dstAmount */);

        await list.removeById(betterId);

        // Removed from linked list
        let head = await getOrderById(await list.HEAD_ID());
        let worse = await getOrderById(worseId);
        // HEAD -> worse -> TAIL
        head.nextId.should.be.bignumber.equal(worse.id);
        worse.nextId.should.be.bignumber.equal(await list.TAIL_ID());
        // HEAD <- worse
        worse.prevId.should.be.bignumber.equal(head.id);
    });

    it("remove order from list maintains order: middle order", async () => {
        let worseId = await addOrderGetId(
            10 /* srcAmount */,
            100 /* dstAmount */);
        let middleId = await addOrderGetId(
            10 /* srcAmount */,
            200 /* dstAmount */);
        let betterId = await addOrderGetId(
            10 /* srcAmount */,
            300 /* dstAmount */);

        await list.removeById(middleId);

        // Removed from linked list
        let head = await getOrderById(await list.HEAD_ID());
        let better = await getOrderById(betterId);
        let worse = await getOrderById(worseId);
        // HEAD -> better -> worse -> TAIL
        head.nextId.should.be.bignumber.equal(better.id);
        better.nextId.should.be.bignumber.equal(worse.id);
        worse.nextId.should.be.bignumber.equal(await list.TAIL_ID());
        // HEAD <- better <- worse
        worse.prevId.should.be.bignumber.equal(better.id);
        better.prevId.should.be.bignumber.equal(head.id);
    });

    it("should reject removing HEAD", async () => {
        try {
            await list.removeById(await list.HEAD_ID());
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(
                Helper.isRevertErrorMessage(e),
                "expected revert but got: " + e);
        }
    });

    it("should reject removing non-existant id", async () => {
        // Calling locally so that the order will not be in fact added to the
        // list and thus the id will be invalid.
        let nonExistantOrderId = await list.add.call(
            10 /* srcAmount */,
            100 /* dstAmount */
        );

        try {
            await list.removeById(nonExistantOrderId);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(
                Helper.isRevertErrorMessage(e),
                "expected revert but got: " + e);
        }
    });

    it("should reject removing order by other maker", async () => {
        // Calling locally so that the order will not be in fact added to the
        // list and thus the id will be invalid.
        let orderId = await addOrderGetId(
            10 /* srcAmount */,
            100 /* dstAmount */,
            {from: user1}
        );

        try {
            await list.removeById(orderId, {from: user2});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(
                Helper.isRevertErrorMessage(e),
                "expected revert but got: " + e);
        }
    });

    // TODO: Only allow maker or admin to remove / update order
    // TODO: allow admin to remove / update orders
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
