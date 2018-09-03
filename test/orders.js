const BigNumber = web3.BigNumber

require("chai")
    .use(require("chai-as-promised"))
    .use(require('chai-bignumber')(BigNumber))
    .should()

let Helper = require("./helper.js");

const Orders = artifacts.require("Orders");

contract('Orders', async (accounts) => {
    before('setup accounts', async () => {
        user1 = accounts[0];
        user2 = accounts[1];
    });

    beforeEach('setup contract for each test', async () => {
        orders = await Orders.new(user1);
        HEAD_ID = await orders.HEAD_ID();
        TAIL_ID = await orders.TAIL_ID();
    });

    it("should have deployed the contract", async () => {
        orders.should.exist;
    });

    it("should have different ids for head and tail", async () => {
        HEAD_ID.should.be.bignumber.not.equal(TAIL_ID);
    });

    it("head should initially point to tail as its nextId", async () => {
        let head = await getOrderById(HEAD_ID);

        head.nextId.should.be.bignumber.equal(TAIL_ID);
    });

    it("should allocate ids for orders that are not head or tail", async () => {
        let firstId = await allocateIds(1);

        firstId.should.be.bignumber.not.equal(HEAD_ID);
        firstId.should.be.bignumber.not.equal(TAIL_ID);
    });

    it("should allocate different ids for orders", async () => {
        let firstAllocationfirstId = (await allocateIds(3)).toNumber();
        let secondAllocationfirstId = (await allocateIds(3)).toNumber();

        let firstAllocationIds = new Set([
            firstAllocationfirstId,
            firstAllocationfirstId + 1,
            firstAllocationfirstId + 2
        ]);

        let secondAllocationIds = new Set([
            secondAllocationfirstId,
            secondAllocationfirstId + 1,
            secondAllocationfirstId + 2
        ]);

        firstAllocationIds.should.not.have.any.keys(Array.from(secondAllocationIds));
        secondAllocationIds.should.not.have.any.keys(Array.from(firstAllocationIds));
    });

    it("should allocate different ids for orders of different sizes", async () => {
        let firstAllocationfirstId = (await allocateIds(5)).toNumber();
        let secondAllocationfirstId = (await allocateIds(3)).toNumber();

        let firstAllocationIds = new Set([
            firstAllocationfirstId,
            firstAllocationfirstId + 1,
            firstAllocationfirstId + 2,
            firstAllocationfirstId + 3,
            firstAllocationfirstId + 4
        ]);

        let secondAllocationIds = new Set([
            secondAllocationfirstId,
            secondAllocationfirstId + 1,
            secondAllocationfirstId + 2
        ]);

        firstAllocationIds.should.not.have.any.keys(Array.from(secondAllocationIds));
        secondAllocationIds.should.not.have.any.keys(Array.from(firstAllocationIds));
    });

    it("should add order and get its data back with user as maker", async () => {
        let order = await addOrder(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */
        );

        order.maker.should.equal(user1);
        order.srcAmount.should.be.bignumber.equal(10);
        order.dstAmount.should.be.bignumber.equal(100);
    });

    it("should add single order so that head is its prev and tail is its next", async () => {
        let order = await addOrder(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */
        );

        order.prevId.should.be.bignumber.equal(HEAD_ID);
        order.nextId.should.be.bignumber.equal(TAIL_ID);
    });

    it("should add two orders and get the data back with users as makers", async () => {
        let order1 = await addOrder(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */
        );
        let order2 = await addOrder(
            user2 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */
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
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */,
            {from: user1}
        );

        let params = await orders.getOrderDetails(orderId, {from: user2});
        let [maker,,,,] = params;

        maker.should.equal(user1);
    });

    it("should add two orders so that -> HEAD <-> first <-> second <-> TAIL", async () => {
        let id1 = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */);
        let id2 = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);

        // HEAD -> 1 -> 2 -> TAIL
        assertOrdersOrder2(id1, id2);
    });

    it("should add orders according to sorting algorithm", async () => {
        let worseId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */
        );
        let betterId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */
        );

        // HEAD -> better -> worse -> TAIL
        assertOrdersOrder2(betterId, worseId);
    });

    it("should calculate order sort key", async () => {
        worse = await orders.calculateOrderSortKey(
            10 /* srcAmount */,
            100 /* dstAmount */
        );
        better = await orders.calculateOrderSortKey(
            10 /* srcAmount */,
            200 /* dstAmount */
        );

        better.should.be.bignumber.greaterThan(worse);
    });

    it("find order prev in empty list", async () => {
        let srcAmount = 10;
        let dstAmount = 100;
        let prevId = await orders.findPrevOrderId(srcAmount, dstAmount);

        prevId.should.be.bignumber.equal(HEAD_ID);
    });

    it("find order prev in list with one better order", async () => {
        let betterId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */
        );

        let srcAmount = 10;
        let dstAmount = 100;
        let prevId = await orders.findPrevOrderId(srcAmount, dstAmount);

        prevId.should.be.bignumber.equal(betterId);
    });

    it("find order prev in list with one worse order", async () => {
        let worseId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */
        );

        let srcAmount = 10;
        let dstAmount = 200;
        let prevId = await orders.findPrevOrderId(srcAmount, dstAmount);

        prevId.should.be.bignumber.equal(HEAD_ID);
    });

    it("find order prev in list with a worse order and a better one", async () => {
        let betterId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            300 /* dstAmount */
        );
        let worseId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */
        );

        let srcAmount = 10;
        let dstAmount = 200;
        let prevId = await orders.findPrevOrderId(srcAmount, dstAmount);

        prevId.should.be.bignumber.equal(betterId);
    });

    it("add order to an empty list", async () => {
        let order = await addOrder(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */
        );

        // HEAD -> order -> TAIL
        assertOrdersOrder1(order.id);
    });

    it("add order to list after better order", async () => {
        let betterId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */
        );

        let order = await addOrder(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */
        );

        // HEAD -> better -> order -> TAIL
        assertOrdersOrder2(betterId, order.id);
    });

    it("add order to list before worse order", async () => {
        let worseId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */
        );

        let order = await addOrder(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */
        );

        // HEAD -> order -> worse -> TAIL
        assertOrdersOrder2(order.id, worseId);
    });

    it("add order to list between better and worse ones", async () => {
        let worseId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */
        );
        let betterId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            300 /* dstAmount */
        );

        let order = await addOrder(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */
        );

        // HEAD -> better -> order -> worse -> TAIL
        assertOrdersOrder3(betterId, order.id, worseId);
    });

    it("add order after a specified order id", async () => {
        let worseId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */
        );
        let betterId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            300 /* dstAmount */
        );

        let order = await addOrderAfterId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */,
            betterId
        );

        // HEAD -> better -> order -> worse -> TAIL
        assertOrdersOrder3(betterId, order.id, worseId);
    });

    it("should reject adding after invalid order id: non-existant", async () => {
        let id = await allocateIds(1);

        // Calling locally so that the order will not be in fact added to the
        // list and thus the id will be invalid.
        let nonExistantOrderId = await orders.allocateIds.call(1);

        let added = await orders.addAfterId.call(
            user1 /* maker */,
            id /* orderId */,
            10 /* srcAmount */,
            200 /* dstAmount */,
            nonExistantOrderId
        );

        added.should.be.false;
    });

    it("should reject adding after invalid order id: is TAIL", async () => {
        let orderId = await allocateIds(1);
        let added = await orders.addAfterId.call(
            user1 /* maker */,
            orderId /* orderId */,
            10 /* srcAmount */,
            200 /* dstAmount */,
            // TAIL is technically a non-existant order, as the ID used for
            // it should not have an order in it, but the verification was
            // added to make this requirement explicit.
            TAIL_ID
        );

        added.should.be.false;
    });

    it("should reject adding after invalid order id: after worse order", async () => {
        let worseId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */
        );

        let orderId = await allocateIds(1);
        let added = await orders.addAfterId.call(
            user1 /* maker */,
            orderId /* orderId */,
            10 /* srcAmount */,
            200 /* dstAmount */,
            worseId);

        added.should.be.false;
    });

    it("should reject adding after invalid order id: before better order", async () => {
        let bestId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            300 /* dstAmount */
        );
        let betterId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */
        );

        let orderId = await allocateIds(1);
        let added = await orders.addAfterId.call(
            user1 /* maker */,
            orderId /* orderId */,
            10 /* srcAmount */,
            100 /* dstAmount */,
            bestId);

        added.should.be.false;
    });

    it("remove order removes from list but does not delete order", async () => {
        let orderId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);

        await orders.removeById(orderId);

        let order = await getOrderById(orderId);
        order.maker.should.be.bignumber.equal(user1);
        order.srcAmount.should.be.bignumber.equal(10);
        order.dstAmount.should.be.bignumber.equal(100);
    });

    it("removing all orders from list: starting with highest", async () => {
        let worseId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);
        let betterId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */);

        await orders.removeById(worseId);
        await orders.removeById(betterId);

        // List is empty
        let head = await getOrderById(HEAD_ID);
        head.nextId.should.be.bignumber.equal(TAIL_ID);
    });

    it("remove all orders from list: starting with lowest", async () => {
        let worseId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);
        let betterId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */);

        await orders.removeById(betterId);
        await orders.removeById(worseId);

        // List is empty
        let head = await getOrderById(HEAD_ID);
        head.nextId.should.be.bignumber.equal(TAIL_ID);
    });

    it("remove order from list maintains order: last order", async () => {
        let worseId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);
        let betterId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */);

        await orders.removeById(worseId);

        // HEAD -> better -> TAIL
        assertOrdersOrder1(betterId);
    });

    it("remove order from list maintains order: first order", async () => {
        let worseId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);
        let betterId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */);

        await orders.removeById(betterId);

        // HEAD -> worse -> TAIL
        assertOrdersOrder1(worseId);
    });

    it("remove order from list maintains order: middle order", async () => {
        let worseId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);
        let middleId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */);
        let betterId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            300 /* dstAmount */);

        await orders.removeById(middleId);

        // HEAD -> better -> worse -> TAIL
        assertOrdersOrder2(betterId, worseId);
    });

    it("should reject removing HEAD", async () => {
        try {
            await orders.removeById(HEAD_ID);
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
        let nonExistantOrderId = await orders.allocateIds.call(1);

        try {
            await orders.removeById(nonExistantOrderId);
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(
                Helper.isRevertErrorMessage(e),
                "expected revert but got: " + e);
        }
    });

    it("should update order contents with new amounts ", async () => {
        let orderId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);

        let srcAmount = 20;
        let dstAmount = 200;
        await orders.update(orderId, srcAmount, dstAmount);

        let order = await getOrderById(orderId);
        order.maker.should.equal(user1);
        order.srcAmount.should.be.bignumber.equal(srcAmount);
        order.dstAmount.should.be.bignumber.equal(dstAmount);
    });

    it("should keep correct order position following update: first -> first", async () => {
        // before: HEAD -> first -> second -> third -> TAIL
        let firstId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            300 /* dstAmount */);
        let secondId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */);
        let thirdId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);

        let srcAmount = 10;
        let dstAmount = 330;
        await orders.update(firstId, srcAmount, dstAmount);

        // after: HEAD -> first -> second -> third -> TAIL
        assertOrdersOrder3(firstId, secondId, thirdId);
    });

    it("should keep correct order position following update: first -> second", async () => {
        // before: HEAD -> first -> second -> third -> TAIL
        let firstId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            300 /* dstAmount */);
        let secondId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */);
        let thirdId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);

        let srcAmount = 10;
        let dstAmount = 130;
        await orders.update(firstId, srcAmount, dstAmount);

        // after: HEAD -> second -> first -> third -> TAIL
        assertOrdersOrder3(secondId, firstId, thirdId);
    });

    it("should keep correct order position following update: first -> third", async () => {
        // before: HEAD -> first -> second -> third -> TAIL
        let firstId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            300 /* dstAmount */);
        let secondId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */);
        let thirdId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);

        let srcAmount = 10;
        let dstAmount = 30;
        await orders.update(firstId, srcAmount, dstAmount);

        // after: HEAD -> second -> third -> first -> TAIL
        assertOrdersOrder3(secondId, thirdId, firstId);
    });

    it("should keep correct order position following update: second -> first", async () => {
        // before: HEAD -> first -> second -> third -> TAIL
        let firstId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            300 /* dstAmount */);
        let secondId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */);
        let thirdId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);

        let srcAmount = 10;
        let dstAmount = 320;
        await orders.update(secondId, srcAmount, dstAmount);

        // after: HEAD -> second -> first -> third -> TAIL
        assertOrdersOrder3(firstId, secondId, thirdId);
    });

    it("should keep correct order position following update: second -> second", async () => {
        // before: HEAD -> first -> second -> third -> TAIL
        let firstId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            300 /* dstAmount */);
        let secondId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */);
        let thirdId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);

        let srcAmount = 10;
        let dstAmount = 220;
        await orders.update(secondId, srcAmount, dstAmount);

        // after: HEAD -> first -> second -> third -> TAIL
        assertOrdersOrder3(firstId, secondId, thirdId);
    });

    it("should keep correct order position following update: second -> third", async () => {
        // before: HEAD -> first -> second -> third -> TAIL
        let firstId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            300 /* dstAmount */);
        let secondId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */);
        let thirdId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);

        let srcAmount = 10;
        let dstAmount = 20;
        await orders.update(secondId, srcAmount, dstAmount);

        // after: HEAD -> first -> third -> second -> TAIL
        assertOrdersOrder3(firstId, thirdId, secondId);
    });

    it("should keep correct order position following update: third -> first", async () => {
        // before: HEAD -> first -> second -> third -> TAIL
        let firstId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            300 /* dstAmount */);
        let secondId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */);
        let thirdId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);

        let srcAmount = 10;
        let dstAmount = 310;
        await orders.update(thirdId, srcAmount, dstAmount);

        // after: HEAD -> third -> first -> second -> TAIL
        assertOrdersOrder3(thirdId, firstId, secondId);
    });

    it("should keep correct order position following update: third -> second", async () => {
        // before: HEAD -> first -> second -> third -> TAIL
        let firstId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            300 /* dstAmount */);
        let secondId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */);
        let thirdId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);

        let srcAmount = 10;
        let dstAmount = 210;
        await orders.update(thirdId, srcAmount, dstAmount);

        // after: HEAD -> first -> third -> second -> TAIL
        assertOrdersOrder3(firstId, thirdId, secondId);
    });

    it("should keep correct order position following update: third -> third", async () => {
        // before: HEAD -> first -> second -> third -> TAIL
        let firstId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            300 /* dstAmount */);
        let secondId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */);
        let thirdId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);

        let srcAmount = 10;
        let dstAmount = 10;
        await orders.update(thirdId, srcAmount, dstAmount);

        // after: HEAD -> first -> second -> third -> TAIL
        assertOrdersOrder3(firstId, secondId, thirdId);
    });

    it("should update order contents with new amounts to given position: values", async () => {
        // before: HEAD -> first -> second -> third -> TAIL
        let firstId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            300 /* dstAmount */);
        let secondId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */);
        let thirdId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);

        let srcAmount = 10;
        let dstAmount = 210;
        await orders.updateWithPositionHint(
            thirdId /* orderId */,
            srcAmount /* srcAmount */,
            dstAmount /* dstAmount */,
            firstId /* prevId */
        );

        let updated = await getOrderById(thirdId);
        updated.maker.should.equal(user1);
        updated.srcAmount.should.be.bignumber.equal(srcAmount);
        updated.dstAmount.should.be.bignumber.equal(dstAmount);
    });

    it("should update order contents with new amounts to given position: order", async () => {
        // before: HEAD -> first -> second -> third -> TAIL
        let firstId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            300 /* dstAmount */);
        let secondId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */);
        let thirdId = await addOrderGetId(
            user1 /* maker */,
            10 /* srcAmount */,
            100 /* dstAmount */);

        let srcAmount = 10;
        let dstAmount = 210;
        await orders.updateWithPositionHint(
            thirdId /* orderId */,
            srcAmount /* srcAmount */,
            dstAmount /* dstAmount */,
            firstId /* prevId */
        );

        // after: HEAD -> first -> Updated -> second -> TAIL
        assertOrdersOrder3(firstId, thirdId, secondId);
    });

    it("should return first order id with getFirstOrder ", async () => {
        let order = await addOrder(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */
        );

        let params = await orders.getFirstOrder();
        let [firstOrderId, isEmpty] = params;

        firstOrderId.should.be.bignumber.equal(order.id);
        isEmpty.should.equal(false);
    });

    it("should return empty if called with getFirstOrder when no order", async () => {
        let params = await orders.getFirstOrder();
        let [firstOrderId, isEmpty] = params;

        isEmpty.should.equal(true);
    });

    it("should allow adding order specifically after head", async () => {
        let orderId = await allocateIds(1);
        await orders.addAfterId.call(
            user1 /* maker */,
            orderId /* orderId */,
            10 /* srcAmount */,
            100 /* dstAmount */,
            HEAD_ID /* prevId */
        );

        assertOrdersOrder1(orderId);
    });

    it("should allow adding order specifically before tail", async () => {
        let order = await addOrder(
            user1 /* maker */,
            10 /* srcAmount */,
            200 /* dstAmount */
        );
        await orders.removeById(order.id);
        let newOrderId = await allocateIds(1);

        await orders.addAfterId.call(
            user1 /* maker */,
            newOrderId /* orderId */,
            10 /* srcAmount */,
            100 /* dstAmount */,
            HEAD_ID /* prevId */
        );

        assertOrdersOrder1(newOrderId);
    });

    // TODO: add without position to a long list fails
    // TODO: update without new position to a long list fails
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
    let params = await orders.getOrderDetails(id);
    let [maker, srcAmount, dstAmount, prevId, nextId] = params;
    return new Order(id, maker, srcAmount, dstAmount, prevId, nextId);
}

async function addOrderGetId(maker, srcAmount, dstAmount, args = {}) {
    let orderId = await allocateIds(1);
    await orders.add(maker, orderId, srcAmount, dstAmount, args);
    return orderId;
}

async function addOrderAfterIdGetId(
    maker,
    srcAmount,
    dstAmount,
    prevId,
    args = {}
)
{
    let orderId = await allocateIds(1);
    let canAdd = await orders.addAfterId.call(
        user1 /* maker */,
        orderId,
        srcAmount,
        dstAmount,
        prevId,
        args
    );
    if (!canAdd) throw new Error('add after id failed');

    await orders.addAfterId(
        user1 /* maker */,
        orderId,
        srcAmount,
        dstAmount,
        prevId,
        args
    );
    return orderId;
}

async function addOrder(maker, srcAmount, dstAmount, args = {}) {
    let orderId = await addOrderGetId(maker, srcAmount, dstAmount, args);
    return await getOrderById(orderId);
}

async function addOrderAfterId(maker, srcAmount, dstAmount, prevId, args = {}) {
    let id = await addOrderAfterIdGetId(
            maker, srcAmount, dstAmount, prevId, args);
    return await getOrderById(id);
}

async function allocateIds(howMany) {
    let firstId = await orders.allocateIds.call(howMany);
    await orders.allocateIds(howMany);
    return firstId;
}

async function assertOrdersOrder1(orderId1) {
    const head = getOrderById(HEAD);
    const order1 = getOrderById(orderId1);

    // after: HEAD -> order1 -> TAIL
    head.nextId.should.be.bignumber.equal(order1.id);
    order1.nextId.should.be.bignumber.equal(TAIL_ID);
    // after: HEAD <- order1
    order1.prevId.should.be.bignumber.equal(head.id);
}

async function assertOrdersOrder2(orderId1, orderId2) {
    const head = getOrderById(HEAD);
    const order1 = getOrderById(orderId1);
    const order2 = getOrderById(orderId2);

    // after: HEAD -> order1 -> order2 -> TAIL
    head.nextId.should.be.bignumber.equal(order1.id);
    order1.nextId.should.be.bignumber.equal(order2.id);
    order2.nextId.should.be.bignumber.equal(TAIL_ID);
    // after: HEAD <- order1 <- order2
    order2.prevId.should.be.bignumber.equal(order1.id);
    order1.prevId.should.be.bignumber.equal(head.id);
}

async function assertOrdersOrder3(orderId1, orderId2, orderId3) {
    const head = getOrderById(HEAD);
    const order1 = getOrderById(orderId1);
    const order2 = getOrderById(orderId2);
    const order3 = getOrderById(orderId3);

    // after: HEAD -> order1 -> order2 -> order3 -> TAIL
    head.nextId.should.be.bignumber.equal(order1.id);
    order1.nextId.should.be.bignumber.equal(order2.id);
    order2.nextId.should.be.bignumber.equal(order3.id);
    order3.nextId.should.be.bignumber.equal(TAIL_ID);
    // after: HEAD <- order1 <- order2 <- order3
    order3.prevId.should.be.bignumber.equal(order2.id);
    order2.prevId.should.be.bignumber.equal(order1.id);
    order1.prevId.should.be.bignumber.equal(head.id);
}
